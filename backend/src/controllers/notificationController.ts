import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

export async function handleListNotifications(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleMarkNotificationRead(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleMarkAllNotificationsRead(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
}
