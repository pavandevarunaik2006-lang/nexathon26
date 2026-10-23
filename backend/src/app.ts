import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { env } from './config/env.js';
import { db } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { incidentsRouter } from './routes/incidents.js';
import { mapAndRoutesRouter } from './routes/mapAndRoutes.js';
import { journeysAndConsentsRouter } from './routes/journeysAndConsents.js';
import { employerRouter } from './routes/employer.js';
import { authorityRouter } from './routes/authority.js';
import { notificationsRouter } from './routes/notifications.js';
import { adminRouter } from './routes/admin.js';
import { emergencyIntelligenceRouter } from './routes/emergencyIntelligence.js';
import { errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './swagger.js';

export function createApp() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV !== 'production') {
          cb(null, true);
        } else {
          cb(new Error('Origin not allowed by CORS'));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Rate limiting for auth and incident submissions (relaxed during automated test runs)
  const isTest = process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test';
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 5000 : 400,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/v1', apiLimiter);

  // Serve static uploaded evidence safely without execution
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
      next();
    },
    express.static(uploadDir)
  );

  // Swagger API Documentation
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // Health Check
  app.get('/api/v1/health', async (_req, res) => {
    const incCount = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM incidents`);
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'roadalert-api',
        databaseEngine: db.getEngineType(),
        seededIncidentsCount: Number(incCount.rows[0]?.count || 0),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Mount v1 API Routers
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/incidents', incidentsRouter);
  app.use('/api/v1', mapAndRoutesRouter);
  app.use('/api/v1', journeysAndConsentsRouter);
  app.use('/api/v1/employer', employerRouter);
  app.use('/api/v1/authority', authorityRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1', emergencyIntelligenceRouter);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}
