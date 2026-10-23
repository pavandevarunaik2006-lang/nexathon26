import { db } from '../db/index.js';
import { UserRole } from '@roadalert/shared';

export async function findUserByEmail(email: string) {
  const res = await db.query<any>(
    `SELECT id, name, email, password_hash, role, status, created_at FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return res.rows[0] || null;
}

export async function findUserById(userId: string) {
  const res = await db.query<any>(
    `SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

export async function getUserOrganizations(userId: string) {
  const res = await db.query<any>(
    `SELECT o.id, o.name, o.organization_type, om.membership_role
     FROM organization_memberships om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1 AND om.status = 'ACTIVE'`,
    [userId]
  );
  return res.rows;
}

export async function createUserRecord(params: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}) {
  await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
    [params.id, params.name, params.email, params.passwordHash, params.role]
  );
}
