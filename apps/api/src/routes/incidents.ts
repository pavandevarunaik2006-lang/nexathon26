import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
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

incidentsRouter.post('/ai-assist', authenticate, handleAiAssist);
incidentsRouter.get('/', handleListIncidents);
incidentsRouter.post('/', authenticate, handleCreateIncident);
incidentsRouter.get('/:id', handleGetIncidentDetail);

// GET /api/v1/incidents/:id/gps-evidence — Retrieve authorized GPS telemetry evidence for an incident
incidentsRouter.get('/:id/gps-evidence', authenticate, async (req, res, next) => {
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
