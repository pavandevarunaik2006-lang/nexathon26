import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  handleAiAssist,
  handleListIncidents,
  handleCreateIncident,
  handleGetIncidentDetail,
  handlePatchIncident,
  handleAttachEvidence,
  handleCorroborateIncident,
  handleFlagIncident,
  handleReviewIncident,
  handleResolveIncident,
} from '../controllers/incidentController.js';

export const incidentsRouter = Router();

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm'].includes(ext)
      ? ext
      : '.bin';
    cb(null, `evidence-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new ApiError(
          400,
          'INVALID_FILE_TYPE',
          `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, MP4, WEBM`
        )
      );
      return;
    }
    cb(null, true);
  },
});

function formatIncidentRow(row: any) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.anonymous_public_display
      ? 'Anonymous Verified Commuter'
      : row.reporter_name || 'Commuter',
    title: row.title,
    description: row.description,
    category: row.category,
    severity: row.severity,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    roadName: row.road_name,
    occurrenceTime: row.occurrence_time,
    reportedAt: row.reported_at,
    updatedAt: row.updated_at,
    status: row.status,
    confidenceScore: Number(row.confidence_score),
    verificationLevel: Number(row.verification_level),
    authorityConfirmed: Boolean(row.authority_confirmed),
    roadClosed: Boolean(row.road_closed),
    anonymousPublicDisplay: Boolean(row.anonymous_public_display),
    estimatedDelayMinutes: Number(row.estimated_delay_minutes || 15),
    demoData: Boolean(row.demo_data),
    corroborationCount: Number(row.corroboration_count || 0),
    evidenceCount: Number(row.evidence_count || 0),
  };
}

// Optional AI assistant endpoint for incident categorization & evidence suggestions
incidentsRouter.post('/ai-assist', authenticate, async (req, res, next) => {
  try {
    const { title = '', description = '', roadName = '' } = req.body || {};
    const suggestion = analyzeIncidentTextHeuristic(
      String(title),
      String(description),
      String(roadName)
    );
    res.json({
      success: true,
      data: suggestion,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/incidents with filters & pagination
incidentsRouter.get('/', async (req, res, next) => {
  try {
    const {
      category,
      severity,
      status,
      minConfidence,
      search,
      demoOnly,
      page = '1',
      limit = '50',
    } = req.query;

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

    res.json({
      success: true,
      data: {
        items: rowsRes.rows.map(formatIncidentRow),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/incidents — Create new incident report with idempotency protection
incidentsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      latitude:
        typeof req.body?.latitude === 'string'
          ? parseFloat(req.body.latitude)
          : req.body?.latitude,
      longitude:
        typeof req.body?.longitude === 'string'
          ? parseFloat(req.body.longitude)
          : req.body?.longitude,
      estimatedDelayMinutes:
        req.body?.estimatedDelayMinutes !== undefined
          ? Number(req.body.estimatedDelayMinutes)
          : 15,
    };

    const parsed = CreateIncidentSchema.parse(body);

    const idempotencyKey =
      parsed.idempotencyKey || (req.headers['x-idempotency-key'] as string | undefined);

    if (idempotencyKey) {
      const existingRes = await db.query<any>(
        `SELECT * FROM incidents WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existingRes.rows.length > 0) {
        const existingBreakdown = await recalculateIncidentConfidence(existingRes.rows[0].id);
        res.status(200).json({
          success: true,
          data: {
            incident: formatIncidentRow(existingRes.rows[0]),
            confidenceBreakdown: existingBreakdown,
            idempotentReplay: true,
          },
        });
        return;
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
        req.user!.userId,
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

    // Record initial location proximity evidence item
    await db.query(
      `INSERT INTO incident_evidences (id, incident_id, submitted_by, evidence_type, metadata, validation_status)
       VALUES ($1, $2, $3, 'LOCATION_PROXIMITY', $4, 'VALIDATED')`,
      [
        crypto.randomUUID(),
        incidentId,
        req.user!.userId,
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
      req.user!.userId,
      'INITIAL_REPORT_SUBMITTED'
    );

    const savedRes = await db.query<any>(
      `SELECT i.*, u.name as reporter_name FROM incidents i LEFT JOIN users u ON u.id = i.reporter_id WHERE i.id = $1`,
      [incidentId]
    );

    // If severity is CRITICAL or Road closure, notify Traffic Authority users
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

    res.status(201).json({
      success: true,
      data: {
        incident: formatIncidentRow(savedRes.rows[0]),
        confidenceBreakdown: breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/incidents/:id — Detailed incident with evidence, corroborations, reviews, nearby incidents & breakdown
incidentsRouter.get('/:id', async (req, res, next) => {
  try {
    const incidentId = String(req.params.id);
    const incRes = await db.query<any>(
      `SELECT i.*, u.name as reporter_name, u.role as reporter_role
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       WHERE i.id = $1`,
      [incidentId]
    );

    if (incRes.rows.length === 0) {
      throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }

    const inc = incRes.rows[0];
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

    // Find nearby related incidents within 8 km
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

    // Recommended next action based on category/severity/confidence
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

    res.json({
      success: true,
      data: {
        incident: {
          ...formatIncidentRow(inc),
          reporterCredibility: {
            roleBadge: inc.reporter_role || 'PASSENGER',
            verifiedAccount: true,
          },
          recommendedAction,
        },
        confidenceBreakdown: breakdown,
        evidences: evidRes.rows,
        corroborations: corrRes.rows,
        reviews: revRes.rows,
        auditTrail: auditRes.rows,
        nearbyIncidents,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/incidents/:id/gps-evidence — Retrieve authorized GPS telemetry evidence for an incident
incidentsRouter.get('/:id/gps-evidence', authenticate, async (req, res, next) => {
<<<<<<< HEAD
=======
  try {
    const incidentId = String(req.params.id);
    const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    if (incRes.rows.length === 0) {
      throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }
    const inc = incRes.rows[0];

    // Authorization: Only TRAFFIC_AUTHORITY, ADMIN, EMPLOYER, or the user who reported
    const userRole = req.user!.role;
    const isReporter = inc.reporter_id === req.user!.userId;
    const isAuthorizedRole = ['TRAFFIC_AUTHORITY', 'ADMIN', 'EMPLOYER'].includes(userRole);

    if (!isAuthorizedRole && !isReporter) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Not authorized to inspect raw GPS evidence for this incident'
      );
    }

    const corrRes = await db.query<any>(
      `SELECT ic.*, u.role as user_role
       FROM incident_corroborations ic
       JOIN users u ON u.id = ic.user_id
       WHERE ic.incident_id = $1 AND ic.corroboration_type = 'GPS_CONGESTION'
       ORDER BY ic.created_at DESC`,
      [incidentId]
    );

    const evidRes = await db.query<any>(
      `SELECT ie.*, u.role as submitter_role
       FROM incident_evidences ie
       JOIN users u ON u.id = ie.submitted_by
       WHERE ie.incident_id = $1 AND ie.evidence_type = 'GPS_TELEMETRY'
       ORDER BY ie.created_at DESC`,
      [incidentId]
    );

    // Redact raw user IDs unless ADMIN or the reporter themselves
    const canSeePii = userRole === 'ADMIN' || isReporter;

    const corroborations = corrRes.rows.map((c: any) => ({
      id: c.id,
      corroborationType: c.corroboration_type,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      speedKmh: c.speed_kmh !== null ? Number(c.speed_kmh) : null,
      notes: c.notes,
      createdAt: c.created_at,
      submitterRole: c.user_role,
      userId: canSeePii ? c.user_id : undefined,
      submitterHash: crypto.createHash('sha256').update(c.user_id).digest('hex').slice(0, 8),
    }));

    const telemetryEvidences = evidRes.rows.map((e: any) => ({
      id: e.id,
      evidenceType: e.evidence_type,
      metadata: e.metadata,
      validationStatus: e.validation_status,
      createdAt: e.created_at,
      submitterRole: e.submitter_role,
      submittedBy: canSeePii ? e.submitted_by : undefined,
      submitterHash: crypto.createHash('sha256').update(e.submitted_by).digest('hex').slice(0, 8),
    }));

    // Record audit trail for telemetry access
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'INCIDENT_GPS_EVIDENCE_ACCESSED', 'INCIDENT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        incidentId,
        JSON.stringify({
          corroborationsCount: corroborations.length,
          evidencesCount: telemetryEvidences.length,
        }),
      ]
    );

    res.json({
      success: true,
      data: {
        incidentId,
        incidentTitle: inc.title,
        roadName: inc.road_name,
        confidenceScore: Number(inc.confidence_score),
        verificationLevel: Number(inc.verification_level),
        gpsCongestionCorroborations: corroborations,
        gpsTelemetryEvidences: telemetryEvidences,
        totalGpsSignals: corroborations.length + telemetryEvidences.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/incidents/:id — Update severity or status by authorized users
incidentsRouter.patch(

  '/:id',
  authenticate,
  requireRoles('TRAFFIC_AUTHORITY', 'ADMIN'),
  async (req, res, next) => {
    try {
      const incidentId = String(req.params.id);
      const PatchSchema = z.object({
        severity: z.enum(INCIDENT_SEVERITIES).optional(),
        status: z.enum(INCIDENT_STATUSES).optional(),
        estimatedDelayMinutes: z.number().min(0).max(720).optional(),
        roadClosed: z.boolean().optional(),
        reason: z.string().min(3).max(500).optional(),
      });
      const parsed = PatchSchema.parse(req.body);

      const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
      if (incRes.rows.length === 0) {
        throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      }
      const current = incRes.rows[0];

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

      await db.query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'INCIDENT_PATCHED', 'INCIDENT', $3, $4)`,
        [
          crypto.randomUUID(),
          req.user!.userId,
          incidentId,
          JSON.stringify(parsed),
        ]
      );

      const breakdown = await recalculateIncidentConfidence(
        incidentId,
        req.user!.userId,
        'INCIDENT_PATCHED'
      );
      const updated = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);

      res.json({
        success: true,
        data: {
          incident: formatIncidentRow(updated.rows[0]),
          confidenceBreakdown: breakdown,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/incidents/:id/evidence — Attach photo/video or telemetry evidence
incidentsRouter.post(
  '/:id/evidence',
  authenticate,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const incidentId = String(req.params.id);
      const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
      if (incRes.rows.length === 0) {
        throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      }

      const evidenceType = req.file
        ? req.file.mimetype.startsWith('video/')
          ? 'VIDEO'
          : 'PHOTO'
        : req.body?.evidenceType || 'PHOTO';

      if (!['PHOTO', 'VIDEO', 'GPS_TELEMETRY', 'LOCATION_PROXIMITY'].includes(evidenceType)) {
        throw new ApiError(400, 'INVALID_EVIDENCE_TYPE', 'Invalid evidence type');
      }

      const storageKey = req.file ? req.file.filename : req.body?.storageKey || 'uploaded-evidence.jpg';
      const metadata = {
        originalName: req.file?.originalname || req.body?.caption || 'Scene evidence',
        mimeType: req.file?.mimetype || 'image/jpeg',
        sizeBytes: req.file?.size || 0,
        caption: req.body?.caption || 'User submitted verification evidence',
        latitude: req.body?.latitude ? Number(req.body.latitude) : undefined,
        longitude: req.body?.longitude ? Number(req.body.longitude) : undefined,
      };

      const evidenceId = crypto.randomUUID();
      await db.query(
        `INSERT INTO incident_evidences (id, incident_id, submitted_by, evidence_type, storage_key, metadata, validation_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'VALIDATED')`,
        [
          evidenceId,
          incidentId,
          req.user!.userId,
          evidenceType,
          storageKey,
          JSON.stringify(metadata),
        ]
      );

      await db.query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'EVIDENCE_SUBMITTED', 'INCIDENT', $3, $4)`,
        [
          crypto.randomUUID(),
          req.user!.userId,
          incidentId,
          JSON.stringify({ evidenceId, evidenceType, storageKey }),
        ]
      );

      const breakdown = await recalculateIncidentConfidence(
        incidentId,
        req.user!.userId,
        'EVIDENCE_ATTACHED'
      );

      res.status(201).json({
        success: true,
        data: {
          evidenceId,
          evidenceType,
          storageKey,
          confidenceBreakdown: breakdown,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/incidents/:id/corroborate — Submit independent corroboration, dispute, or GPS speed corroboration
incidentsRouter.post('/:id/corroborate', authenticate, async (req, res, next) => {
>>>>>>> 91629bb (Save GPS tracking implementation)
  try {
    const incidentId = String(req.params.id);
    const incRes = await db.query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    if (incRes.rows.length === 0) {
      throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }
    const inc = incRes.rows[0];

    // Authorization: Only TRAFFIC_AUTHORITY, ADMIN, EMPLOYER, or the user who reported
    const userRole = req.user!.role;
    const isReporter = inc.reporter_id === req.user!.userId;
    const isAuthorizedRole = ['TRAFFIC_AUTHORITY', 'ADMIN', 'EMPLOYER'].includes(userRole);

    if (!isAuthorizedRole && !isReporter) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Not authorized to inspect raw GPS evidence for this incident'
      );
    }

    const corrRes = await db.query<any>(
      `SELECT ic.*, u.role as user_role
       FROM incident_corroborations ic
       JOIN users u ON u.id = ic.user_id
       WHERE ic.incident_id = $1 AND ic.corroboration_type = 'GPS_CONGESTION'
       ORDER BY ic.created_at DESC`,
      [incidentId]
    );

    const evidRes = await db.query<any>(
      `SELECT ie.*, u.role as submitter_role
       FROM incident_evidences ie
       JOIN users u ON u.id = ie.submitted_by
       WHERE ie.incident_id = $1 AND ie.evidence_type = 'GPS_TELEMETRY'
       ORDER BY ie.created_at DESC`,
      [incidentId]
    );

    // Redact raw user IDs unless ADMIN or the reporter themselves
    const canSeePii = userRole === 'ADMIN' || isReporter;

    const corroborations = corrRes.rows.map((c: any) => ({
      id: c.id,
      corroborationType: c.corroboration_type,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      speedKmh: c.speed_kmh !== null ? Number(c.speed_kmh) : null,
      notes: c.notes,
      createdAt: c.created_at,
      submitterRole: c.user_role,
      userId: canSeePii ? c.user_id : undefined,
      submitterHash: crypto.createHash('sha256').update(c.user_id).digest('hex').slice(0, 8),
    }));

    const telemetryEvidences = evidRes.rows.map((e: any) => ({
      id: e.id,
      evidenceType: e.evidence_type,
      metadata: e.metadata,
      validationStatus: e.validation_status,
      createdAt: e.created_at,
      submitterRole: e.submitter_role,
      submittedBy: canSeePii ? e.submitted_by : undefined,
      submitterHash: crypto.createHash('sha256').update(e.submitted_by).digest('hex').slice(0, 8),
    }));

    // Record audit trail for telemetry access
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'INCIDENT_GPS_EVIDENCE_ACCESSED', 'INCIDENT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        incidentId,
        JSON.stringify({
          corroborationsCount: corroborations.length,
          evidencesCount: telemetryEvidences.length,
        }),
      ]
    );

    res.json({
      success: true,
      data: {
        incidentId,
        incidentTitle: inc.title,
        roadName: inc.road_name,
        confidenceScore: Number(inc.confidence_score),
        verificationLevel: Number(inc.verification_level),
        gpsCongestionCorroborations: corroborations,
        gpsTelemetryEvidences: telemetryEvidences,
        totalGpsSignals: corroborations.length + telemetryEvidences.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/incidents/:id — Update severity or status by authorized users
incidentsRouter.patch(

  '/:id',
  authenticate,
  requireRoles('TRAFFIC_AUTHORITY', 'ADMIN'),
  handlePatchIncident
);
incidentsRouter.post(
  '/:id/evidence',
  authenticate,
  upload.single('file'),
  handleAttachEvidence
);
incidentsRouter.post('/:id/corroborate', authenticate, handleCorroborateIncident);
incidentsRouter.post('/:id/flag', authenticate, handleFlagIncident);
incidentsRouter.post(
  '/:id/review',
  authenticate,
  requireRoles('TRAFFIC_AUTHORITY', 'ADMIN'),
  handleReviewIncident
);
incidentsRouter.post(
  '/:id/resolve',
  authenticate,
  requireRoles('TRAFFIC_AUTHORITY', 'ADMIN'),
  handleResolveIncident
);
