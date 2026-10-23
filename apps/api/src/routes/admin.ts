import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { USER_ROLES } from '@roadalert/shared';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRoles('ADMIN'));

// GET /api/v1/admin/dashboard
adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const countsRes = await db.query<any>(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM organizations) as total_organizations,
        (SELECT COUNT(*) FROM incidents) as total_incidents,
        (SELECT COUNT(*) FROM complaints WHERE status = 'OPEN') as open_complaints,
        (SELECT COUNT(*) FROM audit_logs) as total_audit_logs,
        (SELECT COUNT(*) FROM journeys WHERE status IN ('ACTIVE', 'DELAYED')) as active_journeys
    `);

    const c = countsRes.rows[0] || {};
    res.json({
      success: true,
      data: {
        totalUsers: Number(c.total_users || 0),
        totalOrganizations: Number(c.total_organizations || 0),
        totalIncidents: Number(c.total_incidents || 0),
        openComplaints: Number(c.open_complaints || 0),
        totalAuditLogs: Number(c.total_audit_logs || 0),
        activeJourneys: Number(c.active_journeys || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/users
adminRouter.get('/users', async (req, res, next) => {
  try {
    const { role, status, search } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (role && role !== 'ALL') {
      params.push(String(role));
      conditions.push(`role = $${params.length}`);
    }
    if (status && status !== 'ALL') {
      params.push(String(status));
      conditions.push(`status = $${params.length}`);
    }
    if (search && String(search).trim() !== '') {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const usersRes = await db.query<any>(
      `SELECT id, name, email, role, status, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: usersRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/users/:id
adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const UpdateUserSchema = z.object({
      role: z.enum(USER_ROLES).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
      reason: z.string().min(3).optional(),
    });
    const parsed = UpdateUserSchema.parse(req.body);

    const existing = await db.query<any>(`SELECT * FROM users WHERE id = $1`, [targetId]);
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }
    const u = existing.rows[0];

    await db.query(
      `UPDATE users SET role = $1, status = $2, updated_at = NOW() WHERE id = $3`,
      [parsed.role ?? u.role, parsed.status ?? u.status, targetId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ADMIN_USER_UPDATED', 'USER', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        targetId,
        JSON.stringify({
          previousRole: u.role,
          newRole: parsed.role ?? u.role,
          previousStatus: u.status,
          newStatus: parsed.status ?? u.status,
          reason: parsed.reason || 'Administrative update',
        }),
      ]
    );

    const updated = await db.query<any>(
      `SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = $1`,
      [targetId]
    );

    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/organizations
adminRouter.get('/organizations', async (_req, res, next) => {
  try {
    const orgsRes = await db.query<any>(`
      SELECT o.*,
             otp.tracking_mode,
             otp.retention_days,
             otp.require_consent,
             otp.allow_precise_coordinate,
             (SELECT COUNT(*) FROM organization_memberships om WHERE om.organization_id = o.id) as member_count
      FROM organizations o
      LEFT JOIN organization_tracking_policies otp ON otp.organization_id = o.id
      ORDER BY o.created_at DESC
    `);

    res.json({
      success: true,
      data: orgsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/organizations
adminRouter.post('/organizations', async (req, res, next) => {
  try {
    const OrgCreateSchema = z.object({
      name: z.string().min(3).max(150),
      organizationType: z.string().min(2).max(80),
    });
    const parsed = OrgCreateSchema.parse(req.body);
    const orgId = crypto.randomUUID();

    await db.query(
      `INSERT INTO organizations (id, name, organization_type, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [orgId, parsed.name.trim(), parsed.organizationType.trim()]
    );

    await db.query(
      `INSERT INTO organization_tracking_policies (id, organization_id, tracking_mode, retention_days, require_consent, allow_precise_coordinate)
       VALUES ($1, $2, 'SESSION_ONLY_EXPLICIT', 30, TRUE, FALSE)`,
      [crypto.randomUUID(), orgId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ADMIN_ORGANIZATION_CREATED', 'ORGANIZATION', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, orgId, JSON.stringify(parsed)]
    );

    const created = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
    res.status(201).json({
      success: true,
      data: created.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/complaints
adminRouter.get('/complaints', async (_req, res, next) => {
  try {
    const rowsRes = await db.query<any>(`
      SELECT c.*, u.name as reporter_name, i.title as incident_title, i.road_name, i.status as incident_status
      FROM complaints c
      LEFT JOIN users u ON u.id = c.reporter_id
      LEFT JOIN incidents i ON i.id = c.incident_id
      ORDER BY c.created_at DESC
    `);
    res.json({
      success: true,
      data: rowsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/complaints/:id
adminRouter.patch('/complaints/:id', async (req, res, next) => {
  try {
    const complaintId = req.params.id;
    const status = String(req.body?.status || 'ACTIONED');
    await db.query(`UPDATE complaints SET status = $1 WHERE id = $2`, [status, complaintId]);

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ADMIN_COMPLAINT_UPDATED', 'COMPLAINT', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        complaintId,
        JSON.stringify({ status, reason: req.body?.reason }),
      ]
    );

    const updated = await db.query<any>(`SELECT * FROM complaints WHERE id = $1`, [complaintId]);
    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/audit-logs
adminRouter.get('/audit-logs', async (req, res, next) => {
  try {
    const { entityType, limit = '100' } = req.query;
    const params: any[] = [];
    let where = '';
    if (entityType && entityType !== 'ALL') {
      params.push(String(entityType));
      where = `WHERE al.entity_type = $1`;
    }
    const limitNum = Math.min(200, Math.max(10, parseInt(String(limit), 10) || 100));
    params.push(limitNum);

    const logsRes = await db.query<any>(
      `SELECT al.*, u.name as actor_name, u.email as actor_email, u.role as actor_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: logsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/settings & PATCH /api/v1/admin/settings
adminRouter.get('/settings', async (_req, res, next) => {
  try {
    const rowsRes = await db.query<any>(`SELECT * FROM system_configs ORDER BY key ASC`);
    res.json({
      success: true,
      data: rowsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/settings', async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key || !value) {
      throw new ApiError(400, 'INVALID_CONFIG', 'Both key and value are required');
    }
    await db.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [String(key), JSON.stringify(value)]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ADMIN_SYSTEM_CONFIG_UPDATED', 'SYSTEM_CONFIG', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, String(key), JSON.stringify(value)]
    );

    const rowsRes = await db.query<any>(`SELECT * FROM system_configs ORDER BY key ASC`);
    res.json({
      success: true,
      data: rowsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});
