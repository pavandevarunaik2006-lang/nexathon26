import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { env } from '../config/env.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { db } from '../db/index.js';
import {
  chatWithMobilityAssistant,
  createCommuteDelayReport,
} from '../services/aiAssistantService.js';

export const assistantRouter = Router();

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
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
          `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP.`
        )
      );
      return;
    }
    cb(null, true);
  },
});

const uploadFlexible = (req: Request, res: Response, next: NextFunction) => {
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err: any) => {
    if (err) return next(err);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      req.file = files['image']?.[0] || files['file']?.[0];
    }
    next();
  });
};

/**
 * 1. Conversational Chat with AI Mobility Assistant
 */
assistantRouter.post(
  '/chat',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        message = '',
        history = [],
        evidenceImageUrl,
        evidenceFilePath,
        evidenceOriginalName,
        evidenceMimeType,
        userCoords,
        autoSubmitIncident,
        journeyId,
      } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new ApiError(400, 'INVALID_INPUT', 'Message string is required.');
      }

      const response = await chatWithMobilityAssistant({
        userId: req.user?.userId,
        userRole: req.user?.role,
        message: message.trim(),
        history,
        evidenceImageUrl,
        evidenceFilePath,
        evidenceOriginalName,
        evidenceMimeType,
        userCoords,
        autoSubmitIncident: Boolean(autoSubmitIncident),
        journeyId,
      });

      res.json({
        success: true,
        data: response,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 2. Upload Supporting Evidence Image for Assistant (Incident or Delay Proof)
 */
assistantRouter.post(
  '/upload-evidence',
  authenticate,
  uploadFlexible,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError(400, 'NO_FILE_UPLOADED', 'An image file is required.');
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      res.status(201).json({
        success: true,
        data: {
          filePath: req.file.path,
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          url: fileUrl,
          fileUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 3. Employee Submits Commute Delay Report with Evidence
 */
assistantRouter.post(
  '/delay-report',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        journeyId,
        delayReason,
        delayMinutes,
        evidenceFilePath,
        evidenceOriginalName,
        evidenceMimeType,
      } = req.body;

      if (!delayReason || typeof delayReason !== 'string' || delayReason.trim().length < 3) {
        throw new ApiError(400, 'INVALID_DELAY_REASON', 'A valid delay reason is required.');
      }

      const report = await createCommuteDelayReport({
        employeeId: req.user!.userId,
        journeyId,
        delayReason: delayReason.trim(),
        delayMinutes: delayMinutes ? Number(delayMinutes) : 15,
        evidenceFilePath,
        evidenceOriginalName,
        evidenceMimeType,
      });

      res.status(201).json({
        success: true,
        data: {
          report,
          ...report,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * 4. Employee Views My Commute Delay Reports
 */
assistantRouter.get(
  '/delay-reports/my',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rowsRes = await db.query<any>(
        `SELECT cdr.*, j.origin, j.destination, j.started_at, j.ended_at,
                u.name as reviewer_name
         FROM commute_delay_reports cdr
         LEFT JOIN journeys j ON j.id = cdr.journey_id
         LEFT JOIN users u ON u.id = cdr.reviewer_id
         WHERE cdr.employee_id = $1
         ORDER BY cdr.created_at DESC`,
        [req.user!.userId]
      );

      const list = rowsRes.rows.map((r: any) => ({
        ...r,
        evidenceUrl: r.evidence_file_path ? `/uploads/${path.basename(r.evidence_file_path)}` : null,
      }));

      res.json({
        success: true,
        data: {
          reports: list,
          list,
        },
        reports: list,
      });
    } catch (err) {
      next(err);
    }
  }
);
