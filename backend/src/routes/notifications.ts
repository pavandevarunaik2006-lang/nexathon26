import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  handleListNotifications,
  handleMarkNotificationRead,
  handleMarkAllNotificationsRead,
} from '../controllers/notificationController.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', handleListNotifications);
notificationsRouter.patch('/:id/read', handleMarkNotificationRead);
notificationsRouter.post('/read-all', handleMarkAllNotificationsRead);
