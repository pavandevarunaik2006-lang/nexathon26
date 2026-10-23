import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

export async function getAuthorizedOrgIds(
  userId: string,
  role: string,
  requestedOrgId?: string
): Promise<string[]> {
  if (role === 'ADMIN') {
    if (requestedOrgId) return [requestedOrgId];
    const allOrgs = await db.query<{ id: string }>(`SELECT id FROM organizations`);
    return allOrgs.rows.map((o) => o.id);
  }

  const memRes = await db.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization_memberships
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  const authorizedIds = memRes.rows.map((m) => m.organization_id);

  if (requestedOrgId && !authorizedIds.includes(requestedOrgId)) {
    throw new ApiError(
      403,
      'ORGANIZATION_ISOLATION_VIOLATION',
      'Employer is not authorized to access records belonging to another organization'
    );
  }

  return authorizedIds;
}
