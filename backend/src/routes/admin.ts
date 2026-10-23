import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  handleGetAdminDashboard,
  handleListAdminUsers,
  handleUpdateAdminUser,
  handleListAdminOrganizations,
  handleCreateAdminOrganization,
  handleListAdminComplaints,
  handleUpdateAdminComplaint,
  handleListAdminAuditLogs,
  handleGetAdminSettings,
  handleUpdateAdminSettings,
} from '../controllers/adminController.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRoles('ADMIN'));

adminRouter.get('/dashboard', handleGetAdminDashboard);
adminRouter.get('/users', handleListAdminUsers);
adminRouter.patch('/users/:id', handleUpdateAdminUser);
adminRouter.get('/organizations', handleListAdminOrganizations);
adminRouter.post('/organizations', handleCreateAdminOrganization);
adminRouter.get('/complaints', handleListAdminComplaints);
adminRouter.patch('/complaints/:id', handleUpdateAdminComplaint);
adminRouter.get('/audit-logs', handleListAdminAuditLogs);
adminRouter.get('/settings', handleGetAdminSettings);
adminRouter.patch('/settings', handleUpdateAdminSettings);
