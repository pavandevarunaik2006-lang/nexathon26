import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  handleGetAuthorityDashboard,
  handleGetAuthorityHotspots,
  handleGetAuthorityAnalytics,
  handleListProblemReports,
  handleCreateProblemReport,
} from '../controllers/authorityController.js';

export const authorityRouter = Router();

authorityRouter.use(authenticate, requireRoles('TRAFFIC_AUTHORITY', 'ADMIN'));

authorityRouter.get('/dashboard', handleGetAuthorityDashboard);
authorityRouter.get('/hotspots', handleGetAuthorityHotspots);
authorityRouter.get('/analytics', handleGetAuthorityAnalytics);
authorityRouter.get('/problem-reports', handleListProblemReports);
authorityRouter.post('/problem-reports', handleCreateProblemReport);
