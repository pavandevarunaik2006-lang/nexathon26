import crypto from 'crypto';
import path from 'path';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  formatIncidentRow,
  findIncidentById,
  findIncidentByIdempotencyKey,
} from '../repositories/incidentRepository.js';
import { recordAuditLog } from '../repositories/auditRepository.js';
import {
  recalculateIncidentConfidence,
  haversineDistanceKm,
} from './verificationEngine.js';
import {
  detectRoadDamage,
  RoadDamageAnalysisResult,
} from './roadDamageInferenceService.js';
import {
  CreateIncidentSchema,
  PatchIncidentSchema,
  CorroborateIncidentSchema,
  FlagIncidentSchema,
  ReviewIncidentSchema,
} from '../validators/index.js';

export async function listIncidentsFiltered(query: Record<string, any>) {
  const {
    category,
    severity,
    status,
    minConfidence,
    search,
    demoOnly,
    page = '1',
    limit = '50',
  } = query;

  const conditions: string[] = [];
  const params: any[] = [];

  if (category && category !== 'ALL') {
    params.push(String(category));
    conditions.push(`i.category = $${params.length}`);
  }
  if (severity && severity !== 'ALL') {
    params.push(String(severity));
    conditions.push(`i.severity = $${params.length}`);
  }
  if (status && status !== 'ALL') {
    params.push(String(status));
    conditions.push(`i.status = $${params.length}`);
  }
  if (minConfidence !== undefined && minConfidence !== '') {
    params.push(Number(minConfidence));
    conditions.push(`i.confidence_score >= $${params.length}`);
  }
  if (demoOnly === 'true') {
    conditions.push(`i.demo_data = TRUE`);
  }
  if (search && String(search).trim() !== '') {
    params.push(`%${String(search).trim()}%`);
    conditions.push(
      `(i.title ILIKE $${params.length} OR i.road_name ILIKE $${params.length} OR i.description ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM incidents i ${whereClause}`,
    params
  );
  const total = Number(countRes.rows[0]?.count || 0);

  const queryParams = [...params, limitNum, offset];
  const rowsRes = await db.query<any>(
    `SELECT i.*,
            u.name as reporter_name,
            (SELECT COUNT(*) FROM incident_corroborations ic WHERE ic.incident_id = i.id AND ic.corroboration_type != 'DISPUTE') as corroboration_count,
            (SELECT COUNT(*) FROM incident_evidences ie WHERE ie.incident_id = i.id) as evidence_count
     FROM incidents i
     LEFT JOIN users u ON u.id = i.reporter_id
     ${whereClause}
     ORDER BY i.reported_at DESC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );

  return {
    items: rowsRes.rows.map(formatIncidentRow),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

export async function createIncidentReport(
  userId: string,
  rawBody: any,
  headerIdempotencyKey?: string
) {
  const body = {
    ...rawBody,
    latitude:
      typeof rawBody?.latitude === 'string'
        ? parseFloat(rawBody.latitude)
        : rawBody?.latitude,
    longitude:
      typeof rawBody?.longitude === 'string'
        ? parseFloat(rawBody.longitude)
        : rawBody?.longitude,
    estimatedDelayMinutes:
      rawBody?.estimatedDelayMinutes !== undefined
        ? Number(rawBody.estimatedDelayMinutes)
        : 15,
  };

  const parsed = CreateIncidentSchema.parse(body);
  const idempotencyKey = parsed.idempotencyKey || headerIdempotencyKey;

  if (idempotencyKey) {
    const existing = await findIncidentByIdempotencyKey(idempotencyKey);
    if (existing) {
      const existingBreakdown = await recalculateIncidentConfidence(existing.id);
      return {
        statusCode: 200,
        data: {
          incident: formatIncidentRow(existing),
          confidenceBreakdown: existingBreakdown,
          idempotentReplay: true,
        },
      };
    }
  }

  const incidentId = crypto.randomUUID();
  const occurrenceTime = parsed.occurrenceTime
    ? new Date(parsed.occurrenceTime).toISOString()
    : new Date().toISOString();

  await db.query(
    `INSERT INTO incidents (
      id, reporter_id, title, description, category, severity,
      latitude, longitude, road_name, occurrence_time, status,
      anonymous_public_display, estimated_delay_minutes, idempotency_key, demo_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REPORTED',$11,$12,$13,FALSE)`,
    [
      incidentId,
      userId,
      parsed.title.trim(),
      parsed.description.trim(),
      parsed.category,
      parsed.severity,
      parsed.latitude,
      parsed.longitude,
      parsed.roadName.trim(),
      occurrenceTime,
      parsed.anonymousPublicDisplay,
      parsed.estimatedDelayMinutes,
      idempotencyKey || null,
    ]
  );

  await db.query(
    `INSERT INTO incident_evidences (id, incident_id, submitted_by, evidence_type, metadata, validation_status)
     VALUES ($1, $2, $3, 'LOCATION_PROXIMITY', $4, 'VALIDATED')`,
    [
      crypto.randomUUID(),
      incidentId,
      userId,
      JSON.stringify({
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        roadName: parsed.roadName,
        occurrenceTime,
      }),
    ]
  );

  const breakdown = await recalculateIncidentConfidence(
    incidentId,
    userId,
    'INITIAL_REPORT_SUBMITTED'
  );

  const saved = await findIncidentById(incidentId);

  if (parsed.severity === 'CRITICAL' || parsed.category === 'Road closure') {
    const authUsers = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'TRAFFIC_AUTHORITY'`
    );
    for (const au of authUsers.rows) {
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, incident_id)
         VALUES ($1, $2, 'HIGH_CONFIDENCE_ALERT', $3, $4, $5)`,
        [
          crypto.randomUUID(),
          au.id,
          `New ${parsed.severity} Report: ${parsed.category}`,
          `${parsed.title} reported at ${parsed.roadName}. Awaiting verification review.`,
          incidentId,
        ]
      );
    }
  }

  return {
    statusCode: 201,
    data: {
      incident: formatIncidentRow(saved),
      confidenceBreakdown: breakdown,
    },
  };
}

export async function getIncidentDetailById(incidentId: string) {
  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  const breakdown = await recalculateIncidentConfidence(incidentId);

  const evidRes = await db.query<any>(
    `SELECT ie.*, u.name as submitter_name, u.role as submitter_role
     FROM incident_evidences ie
     LEFT JOIN users u ON u.id = ie.submitted_by
     WHERE ie.incident_id = $1
     ORDER BY ie.created_at DESC`,
    [incidentId]
  );

  const corrRes = await db.query<any>(
    `SELECT ic.*, u.name as user_name, u.role as user_role
     FROM incident_corroborations ic
     LEFT JOIN users u ON u.id = ic.user_id
     WHERE ic.incident_id = $1
     ORDER BY ic.created_at DESC`,
    [incidentId]
  );

  const revRes = await db.query<any>(
    `SELECT ir.*, u.name as reviewer_name, u.role as reviewer_role
     FROM incident_reviews ir
     LEFT JOIN users u ON u.id = ir.reviewer_id
     WHERE ir.incident_id = $1
     ORDER BY ir.created_at DESC`,
    [incidentId]
  );

  const auditRes = await db.query<any>(
    `SELECT al.*, u.name as actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.entity_type = 'INCIDENT' AND al.entity_id = $1
     ORDER BY al.created_at DESC
     LIMIT 20`,
    [incidentId]
  );

  const allOther = await db.query<any>(
    `SELECT id, title, category, severity, status, latitude, longitude, road_name, confidence_score, estimated_delay_minutes, demo_data
     FROM incidents WHERE id != $1 AND status != 'REJECTED'`,
    [incidentId]
  );
  const nearbyIncidents = allOther.rows
    .map((other: any) => ({
      ...other,
      distanceKm:
        Math.round(
          haversineDistanceKm(
            Number(inc.latitude),
            Number(inc.longitude),
            Number(other.latitude),
            Number(other.longitude)
          ) * 100
        ) / 100,
    }))
    .filter((o: any) => o.distanceKm <= 8)
    .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
    .slice(0, 5);

  let recommendedAction =
    'Monitor corridor updates and verify if traversing this stretch.';
  if (inc.road_closed || inc.category === 'Road closure') {
    recommendedAction =
      'DO NOT TRAVERSE CLOSED CARRIAGEWAY. Use Route Planner to select the SH-1 Inland Bypass or alternate connector.';
  } else if (inc.severity === 'CRITICAL' || Number(inc.confidence_score) >= 80) {
    recommendedAction = `High-confidence disruption (+${inc.estimated_delay_minutes}m delay). Divert via alternate corridor or delay departure if non-urgent.`;
  } else if (Number(inc.confidence_score) < 60) {
    recommendedAction =
      'Low/moderate confidence report. Commuters on scene are encouraged to submit safe corroboration or photo evidence.';
  }

  const formattedEvidences = evidRes.rows.map((e: any) => {
    const url = e.storage_key
      ? e.storage_key.startsWith('http://') || e.storage_key.startsWith('https://')
        ? e.storage_key
        : `/uploads/${e.storage_key}`
      : null;
    return {
      ...e,
      url,
      evidenceUrl: url,
    };
  });

  return {
    incident: {
      ...formatIncidentRow(inc),
      reporterCredibility: {
        roleBadge: inc.reporter_role || 'PASSENGER',
        verifiedAccount: true,
      },
      recommendedAction,
    },
    confidenceBreakdown: breakdown,
    evidences: formattedEvidences,
    corroborations: corrRes.rows,
    reviews: revRes.rows,
    auditTrail: auditRes.rows,
    nearbyIncidents,
  };
}

export async function patchIncidentById(
  incidentId: string,
  userId: string,
  body: unknown
) {
  const parsed = PatchIncidentSchema.parse(body);
  const current = await findIncidentById(incidentId);
  if (!current) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  await db.query(
    `UPDATE incidents
     SET severity = $1,
         status = $2,
         estimated_delay_minutes = $3,
         road_closed = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [
      parsed.severity ?? current.severity,
      parsed.status ?? current.status,
      parsed.estimatedDelayMinutes ?? current.estimated_delay_minutes,
      parsed.roadClosed ?? current.road_closed,
      incidentId,
    ]
  );

  await recordAuditLog({
    actorId: userId,
    action: 'INCIDENT_PATCHED',
    entityType: 'INCIDENT',
    entityId: incidentId,
    metadata: parsed,
  });

  const breakdown = await recalculateIncidentConfidence(
    incidentId,
    userId,
    'INCIDENT_PATCHED'
  );
  const updated = await findIncidentById(incidentId);

  return {
    incident: formatIncidentRow(updated),
    confidenceBreakdown: breakdown,
  };
}

export async function attachIncidentEvidence(
  incidentId: string,
  userId: string,
  file: Express.Multer.File | undefined,
  body: any
) {
  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  const evidenceType = file
    ? file.mimetype.startsWith('video/')
      ? 'VIDEO'
      : 'PHOTO'
    : body?.evidenceType || 'PHOTO';

  if (!['PHOTO', 'VIDEO', 'GPS_TELEMETRY', 'LOCATION_PROXIMITY'].includes(evidenceType)) {
    throw new ApiError(400, 'INVALID_EVIDENCE_TYPE', 'Invalid evidence type');
  }

  const storageKey = file ? file.filename : body?.storageKey || 'uploaded-evidence.jpg';

  // Run road damage detection asynchronously on uploaded photo evidence
  let roadDamageAnalysis: RoadDamageAnalysisResult | undefined;
  if (file && evidenceType === 'PHOTO') {
    try {
      const filePath = file.path || path.resolve(process.cwd(), env.UPLOAD_DIR, file.filename);
      roadDamageAnalysis = await detectRoadDamage(filePath);
    } catch (err: any) {
      console.warn(`[RoadDamageDetector] Detection skipped on evidence upload: ${err.message}`);
    }
  }

  const metadata = {
    originalName: file?.originalname || body?.caption || 'Scene evidence',
    mimeType: file?.mimetype || 'image/jpeg',
    sizeBytes: file?.size || 0,
    caption: body?.caption || 'User submitted verification evidence',
    latitude: body?.latitude ? Number(body.latitude) : undefined,
    longitude: body?.longitude ? Number(body.longitude) : undefined,
    ...(roadDamageAnalysis
      ? {
          roadDamageAnalysis: {
            analyzed: roadDamageAnalysis.analyzed,
            modelLoaded: roadDamageAnalysis.modelLoaded,
            modelName: roadDamageAnalysis.modelName,
            damageDetected: roadDamageAnalysis.damageDetected,
            detectionsCount: roadDamageAnalysis.detectionsCount,
            detections: roadDamageAnalysis.detections,
            statusNote: roadDamageAnalysis.statusNote,
          },
        }
      : {}),
  };

  const evidenceId = crypto.randomUUID();
  await db.query(
    `INSERT INTO incident_evidences (id, incident_id, submitted_by, evidence_type, storage_key, metadata, validation_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'VALIDATED')`,
    [
      evidenceId,
      incidentId,
      userId,
      evidenceType,
      storageKey,
      JSON.stringify(metadata),
    ]
  );

  await recordAuditLog({
    actorId: userId,
    action: 'EVIDENCE_SUBMITTED',
    entityType: 'INCIDENT',
    entityId: incidentId,
    metadata: {
      evidenceId,
      evidenceType,
      storageKey,
      damageDetected: roadDamageAnalysis?.damageDetected ?? false,
    },
  });

  const breakdown = await recalculateIncidentConfidence(
    incidentId,
    userId,
    'EVIDENCE_ATTACHED'
  );

  const evidenceUrl = storageKey.startsWith('http://') || storageKey.startsWith('https://')
    ? storageKey
    : `/uploads/${storageKey}`;

  return {
    evidenceId,
    evidenceType,
    storageKey,
    url: evidenceUrl,
    evidenceUrl,
    confidenceBreakdown: breakdown,
    roadDamageAnalysis,
  };
}

export async function submitIncidentCorroboration(
  incidentId: string,
  userId: string,
  body: unknown
) {
  const parsed = CorroborateIncidentSchema.parse(body);
  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  const dupRes = await db.query<any>(
    `SELECT id FROM incident_corroborations
     WHERE incident_id = $1 AND user_id = $2 AND corroboration_type = $3`,
    [incidentId, userId, parsed.corroborationType]
  );

  const isSameAsOriginalReporter =
    inc.reporter_id === userId && parsed.corroborationType === 'CORROBORATE';

  let duplicateIgnored = false;
  if (dupRes.rows.length === 0 && !isSameAsOriginalReporter) {
    await db.query(
      `INSERT INTO incident_corroborations (id, incident_id, user_id, corroboration_type, latitude, longitude, speed_kmh, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        incidentId,
        userId,
        parsed.corroborationType,
        parsed.latitude ?? inc.latitude,
        parsed.longitude ?? inc.longitude,
        parsed.speedKmh ?? null,
        parsed.notes ?? null,
      ]
    );
  } else {
    duplicateIgnored = true;
  }

  const breakdown = await recalculateIncidentConfidence(
    incidentId,
    userId,
    `CORROBORATION_${parsed.corroborationType}`
  );

  if (!duplicateIgnored && inc.reporter_id !== userId) {
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, incident_id)
       VALUES ($1, $2, 'CORROBORATION', $3, $4, $5)`,
      [
        crypto.randomUUID(),
        inc.reporter_id,
        `Incident Corroborated (${breakdown.totalScore}/100)`,
        `Your report "${inc.title}" received ${parsed.corroborationType.toLowerCase()} feedback. Current confidence: ${breakdown.totalScore}/100 (${breakdown.band}).`,
        incidentId,
      ]
    );
  }

  return {
    duplicateIgnored,
    isSameAsOriginalReporter,
    confidenceBreakdown: breakdown,
  };
}

export async function flagSuspiciousIncident(
  incidentId: string,
  userId: string,
  body: unknown
) {
  const parsed = FlagIncidentSchema.parse(body);
  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  const complaintId = crypto.randomUUID();
  await db.query(
    `INSERT INTO complaints (id, reporter_id, incident_id, reason, status)
     VALUES ($1, $2, $3, $4, 'OPEN')`,
    [complaintId, userId, incidentId, parsed.reason.trim()]
  );

  await recordAuditLog({
    actorId: userId,
    action: 'INCIDENT_FLAGGED_COMPLAINT',
    entityType: 'INCIDENT',
    entityId: incidentId,
    metadata: {
      complaintId,
      reason: parsed.reason,
    },
  });

  return {
    complaintId,
    status: 'OPEN',
    message: 'Report flagged for Traffic Authority and Admin review',
  };
}

export async function reviewIncidentByAuthority(
  incidentId: string,
  userId: string,
  body: unknown
) {
  const parsed = ReviewIncidentSchema.parse(body);
  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  const reviewId = crypto.randomUUID();
  await db.query(
    `INSERT INTO incident_reviews (id, incident_id, reviewer_id, decision, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [reviewId, incidentId, userId, parsed.decision, parsed.reason.trim()]
  );

  let newSeverity = parsed.newSeverity || inc.severity;
  let newStatus = parsed.newStatus || inc.status;
  let authorityConfirmed = Boolean(inc.authority_confirmed);
  let roadClosed = Boolean(inc.road_closed);

  if (parsed.decision === 'CONFIRM') {
    authorityConfirmed = true;
    newStatus = 'VERIFIED';
  } else if (parsed.decision === 'REJECT') {
    authorityConfirmed = false;
    newStatus = 'REJECTED';
  } else if (parsed.decision === 'MARK_ROAD_CLOSED') {
    authorityConfirmed = true;
    roadClosed = true;
    newStatus = 'VERIFIED';
    newSeverity = 'CRITICAL';
  } else if (parsed.decision === 'RESOLVE') {
    newStatus = 'RESOLVED';
    roadClosed = false;
  }

  await db.query(
    `UPDATE incidents
     SET severity = $1,
         status = $2,
         authority_confirmed = $3,
         road_closed = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [newSeverity, newStatus, authorityConfirmed, roadClosed, incidentId]
  );

  await recordAuditLog({
    actorId: userId,
    action: `AUTHORITY_REVIEW:${parsed.decision}`,
    entityType: 'INCIDENT',
    entityId: incidentId,
    metadata: {
      reviewId,
      decision: parsed.decision,
      reason: parsed.reason,
      newSeverity,
      newStatus,
      roadClosed,
    },
  });

  const breakdown = await recalculateIncidentConfidence(
    incidentId,
    userId,
    `AUTHORITY_REVIEW_${parsed.decision}`
  );

  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, message, incident_id)
     VALUES ($1, $2, 'STATUS_CHANGE', $3, $4, $5)`,
    [
      crypto.randomUUID(),
      inc.reporter_id,
      `Traffic Authority Review: ${parsed.decision}`,
      `Your report "${inc.title}" at ${inc.road_name} was reviewed (${parsed.decision}): ${parsed.reason}`,
      incidentId,
    ]
  );

  const updated = await findIncidentById(incidentId);

  return {
    reviewId,
    incident: formatIncidentRow(updated),
    confidenceBreakdown: breakdown,
  };
}

export async function resolveIncidentByAuthority(
  incidentId: string,
  userId: string,
  rawReason?: string
) {
  const reason =
    rawReason && String(rawReason).trim().length >= 3
      ? String(rawReason).trim()
      : 'Roadway cleared and normal traffic flow restored.';

  const inc = await findIncidentById(incidentId);
  if (!inc) {
    throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  }

  await db.query(
    `UPDATE incidents SET status = 'RESOLVED', road_closed = FALSE, updated_at = NOW() WHERE id = $1`,
    [incidentId]
  );

  await db.query(
    `INSERT INTO incident_reviews (id, incident_id, reviewer_id, decision, reason)
     VALUES ($1, $2, $3, 'RESOLVE', $4)`,
    [crypto.randomUUID(), incidentId, userId, reason]
  );

  await recordAuditLog({
    actorId: userId,
    action: 'INCIDENT_RESOLVED',
    entityType: 'INCIDENT',
    entityId: incidentId,
    metadata: { reason },
  });

  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, message, incident_id)
     VALUES ($1, $2, 'STATUS_CHANGE', $3, $4, $5)`,
    [
      crypto.randomUUID(),
      inc.reporter_id,
      `Incident Resolved: ${inc.road_name}`,
      `Traffic Authority marked "${inc.title}" as RESOLVED: ${reason}`,
      incidentId,
    ]
  );

  const updated = await findIncidentById(incidentId);
  return {
    incident: formatIncidentRow(updated),
  };
}
