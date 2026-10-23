import { db } from '../db/index.js';
import { IncidentDbRow } from '../types/index.js';

export function formatIncidentRow(row: IncidentDbRow | any) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.anonymous_public_display
      ? 'Anonymous Verified Commuter'
      : row.reporter_name || 'Commuter',
    title: row.title,
    description: row.description,
    category: row.category,
    severity: row.severity,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    roadName: row.road_name,
    occurrenceTime: row.occurrence_time,
    reportedAt: row.reported_at,
    updatedAt: row.updated_at,
    status: row.status,
    confidenceScore: Number(row.confidence_score),
    verificationLevel: Number(row.verification_level),
    authorityConfirmed: Boolean(row.authority_confirmed),
    roadClosed: Boolean(row.road_closed),
    anonymousPublicDisplay: Boolean(row.anonymous_public_display),
    estimatedDelayMinutes: Number(row.estimated_delay_minutes || 15),
    demoData: Boolean(row.demo_data),
    corroborationCount: Number(row.corroboration_count || 0),
    evidenceCount: Number(row.evidence_count || 0),
  };
}

export async function findIncidentById(incidentId: string) {
  const res = await db.query<any>(
    `SELECT i.*, u.name as reporter_name, u.role as reporter_role
     FROM incidents i
     LEFT JOIN users u ON u.id = i.reporter_id
     WHERE i.id = $1`,
    [incidentId]
  );
  return res.rows[0] || null;
}

export async function findIncidentByIdempotencyKey(idempotencyKey: string) {
  const res = await db.query<any>(
    `SELECT * FROM incidents WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  return res.rows[0] || null;
}

export async function listActiveIncidents() {
  const res = await db.query<any>(
    `SELECT * FROM incidents WHERE status NOT IN ('RESOLVED', 'REJECTED')`
  );
  return res.rows;
}
