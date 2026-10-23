import { Router } from 'express';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

// GET /api/v1/notifications — List current user's notifications & unread count
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const rowsRes = await db.query<any>(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.userId]
    );

    const unreadCount = rowsRes.rows.filter((n: any) => !n.read_at).length;

    res.json({
      success: true,
      data: {
        unreadCount,
        items: rowsRes.rows.map((n: any) => ({
          id: n.id,
          userId: n.user_id,
          type: n.type,
          title: n.title,
          message: n.message,
          incidentId: n.incident_id,
          journeyId: n.journey_id,
          deliveryStatus: n.delivery_status,
          readAt: n.read_at,
          createdAt: n.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/notifications/:id/read — Mark single notification as read
notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const notifId = req.params.id;
    const existing = await db.query<any>(`SELECT * FROM notifications WHERE id = $1`, [notifId]);
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    }
    if (existing.rows[0].user_id !== req.user!.userId) {
      throw new ApiError(403, 'FORBIDDEN', 'Cannot modify another user notification');
    }

    await db.query(`UPDATE notifications SET read_at = NOW() WHERE id = $1`, [notifId]);
    const updated = await db.query<any>(`SELECT * FROM notifications WHERE id = $1`, [notifId]);

    res.json({
      success: true,
      data: {
        id: updated.rows[0].id,
        readAt: updated.rows[0].read_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/read-all — Mark all notifications for current user as read
notificationsRouter.post('/read-all', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user!.userId]
    );
    res.json({
      success: true,
      data: { message: 'All notifications marked as read' },
    });
  } catch (err) {
    next(err);
  }
});
