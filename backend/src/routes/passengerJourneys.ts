import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  handleStartPassengerJourney,
  handleGetActivePassengerJourney,
  handleMonitorPassengerJourney,
  handleSwitchPassengerRoute,
  handleEndPassengerJourney,
} from '../controllers/passengerJourneyController.js';

export const passengerJourneysRouter = Router();

passengerJourneysRouter.post('/start', authenticate, handleStartPassengerJourney);
passengerJourneysRouter.get('/active', authenticate, handleGetActivePassengerJourney);
passengerJourneysRouter.post('/:id/monitor', authenticate, handleMonitorPassengerJourney);
passengerJourneysRouter.post('/:id/switch-route', authenticate, handleSwitchPassengerRoute);
passengerJourneysRouter.post('/:id/end', authenticate, handleEndPassengerJourney);
