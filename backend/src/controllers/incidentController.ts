import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { anonymizeIdHash } from '../utils/index.js';
import { analyzeIncidentTextHeuristic } from '../services/aiAssistantService.js';
import {
  listIncidentsFiltered,
  createIncidentReport,
  getIncidentDetailById,
  patchIncidentById,
  attachIncidentEvidence,
  submitIncidentCorroboration,
  flagSuspiciousIncident,
  reviewIncidentByAuthority,
  resolveIncidentByAuthority,
} from '../services/incidentService.js';

export async function handleAiAssist(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleListIncidents(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listIncidentsFiltered(req.query);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const headerKey = req.headers['x-idempotency-key'] as string | undefined;
    const result = await createIncidentReport(req.user!.userId, req.body, headerKey);
    res.status(result.statusCode).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetIncidentDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getIncidentDetailById(String(req.params.id));
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetIncidentGpsEvidence(req: Request, res: Response, next: NextFunction) {
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
      submitterHash: anonymizeIdHash(c.user_id, 8),
    }));

    const telemetryEvidences = evidRes.rows.map((e: any) => ({
      id: e.id,
      evidenceType: e.evidence_type,
      metadata: e.metadata,
      validationStatus: e.validation_status,
      createdAt: e.created_at,
      submitterRole: e.submitter_role,
      submittedBy: canSeePii ? e.submitted_by : undefined,
      submitterHash: anonymizeIdHash(e.submitted_by, 8),
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
}

export async function handlePatchIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await patchIncidentById(String(req.params.id), req.user!.userId, req.body);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleAttachEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await attachIncidentEvidence(
      String(req.params.id),
      req.user!.userId,
      req.file,
      req.body
    );
    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCorroborateIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await submitIncidentCorroboration(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleFlagIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await flagSuspiciousIncident(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleReviewIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await reviewIncidentByAuthority(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleResolveIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await resolveIncidentByAuthority(
      String(req.params.id),
      req.user!.userId,
      req.body?.reason
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
