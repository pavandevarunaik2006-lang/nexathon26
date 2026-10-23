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
  handleGetIncidentGpsEvidence,
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
incidentsRouter.get('/:id/gps-evidence', authenticate, handleGetIncidentGpsEvidence);
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
