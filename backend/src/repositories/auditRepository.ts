import crypto from 'crypto';
import { db } from '../db/index.js';

export async function recordAuditLog(params: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      params.actorId,
      params.action,
      params.entityType,
      params.entityId,
      JSON.stringify(params.metadata || {}),
    ]
  );
}

export async function getEntityAuditTrail(entityType: string, entityId: string, limit = 20) {
  const res = await db.query<any>(
    `SELECT al.*, u.name as actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );
  return res.rows;
}

export async function listSystemAuditLogs(entityType?: string, limit = 100) {
  const params: any[] = [];
  let where = '';
  if (entityType && entityType !== 'ALL') {
    params.push(String(entityType));
    where = `WHERE al.entity_type = $1`;
  }
  const limitNum = Math.min(200, Math.max(10, Number(limit) || 100));
  params.push(limitNum);

  const res = await db.query<any>(
    `SELECT al.*, u.name as actor_name, u.email as actor_email, u.role as actor_role
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return res.rows;
}
