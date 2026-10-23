import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  handleGetMyConsents,
  handleCreateConsent,
  handleRevokeConsent,
  handleStartJourney,
  handleListMyJourneys,
  handleGetJourneyMetrics,
  handleGetJourneyById,
  handleRecordJourneyCheckpoints,
  handleStopJourney,
} from '../controllers/journeyController.js';

export const journeysAndConsentsRouter = Router();

journeysAndConsentsRouter.get('/consents/me', authenticate, handleGetMyConsents);
journeysAndConsentsRouter.post('/consents', authenticate, handleCreateConsent);
journeysAndConsentsRouter.post('/consents/:id/revoke', authenticate, handleRevokeConsent);

journeysAndConsentsRouter.post('/journeys', authenticate, handleStartJourney);
journeysAndConsentsRouter.get('/journeys', authenticate, handleListMyJourneys);
journeysAndConsentsRouter.get('/journeys/metrics', authenticate, handleGetJourneyMetrics);
journeysAndConsentsRouter.get('/journeys/:id', authenticate, handleGetJourneyById);
journeysAndConsentsRouter.post(
  '/journeys/:id/checkpoints',
  authenticate,
  handleRecordJourneyCheckpoints
);
journeysAndConsentsRouter.post('/journeys/:id/stop', authenticate, handleStopJourney);
