import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import {
  handleGetEmployerDashboard,
  handleListEmployerEmployees,
  handleListEmployerJourneys,
  handleListEmployerPolicies,
  handleUpdateEmployerPolicy,
  handleGetEmployerActiveLocations,
} from '../controllers/employerController.js';

export const employerRouter = Router();

employerRouter.use(authenticate, requireRoles('EMPLOYER', 'ADMIN'));

employerRouter.get('/dashboard', handleGetEmployerDashboard);
employerRouter.get('/employees', handleListEmployerEmployees);
employerRouter.get('/journeys', handleListEmployerJourneys);
employerRouter.get('/policies', handleListEmployerPolicies);
employerRouter.patch('/policies/:id', handleUpdateEmployerPolicy);
employerRouter.get('/active-locations', handleGetEmployerActiveLocations);
