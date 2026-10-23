import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

export const employerRouter = Router();

employerRouter.use(authenticate, requireRoles('EMPLOYER', 'ADMIN'));

async function getAuthorizedOrgIds(userId: string, role: string, requestedOrgId?: string): Promise<string[]> {
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

// GET /api/v1/employer/dashboard
employerRouter.get('/dashboard', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);

    if (orgIds.length === 0) {
      res.json({
        success: true,
        data: {
          organization: null,
          metrics: {
            authorizedEmployees: 0,
            activeConsentedJourneys: 0,
            delayedCommutes: 0,
            avgVerifiedDelayMin: 0,
          },
          activeJourneys: [],
          relevantCorridorIncidents: [],
        },
      });
      return;
    }

    const primaryOrgId = orgIds[0];
    const orgRes = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [primaryOrgId]);
    const policyRes = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE organization_id = $1`,
      [primaryOrgId]
    );

    const empRes = await db.query<any>(
      `SELECT u.id, u.name, u.email, om.membership_role, om.status
       FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND om.membership_role = 'EMPLOYEE'`,
      [primaryOrgId]
    );

    // Fetch only journeys with active, non-revoked consent for this organization
    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.purpose as consent_purpose, tc.share_precise_coords, tc.revoked_at
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const allowPrecisePolicy = Boolean(policyRes.rows[0]?.allow_precise_coordinate);

    const sanitizedJourneys = journeysRes.rows.map((j: any) => {
      const canExposeCoords = allowPrecisePolicy && Boolean(j.share_precise_coords);
      return {
        id: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        origin: j.origin,
        destination: j.destination,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: j.status,
        estimatedDelayMin: Number(j.estimated_delay_min || 0),
        verifiedDelayMin: Number(j.verified_delay_min || 0),
        verificationLevel: Number(j.verification_level || 1),
        manualSelfReported: Boolean(j.manual_self_reported),
        manualStatusNote: j.manual_status_note,
        demoData: Boolean(j.demo_data),
        preciseCoordinatesRedacted: !canExposeCoords,
        ...(canExposeCoords
          ? {
              originLat: j.origin_lat,
              originLng: j.origin_lng,
              destLat: j.dest_lat,
              destLng: j.dest_lng,
            }
          : {}),
      };
    });

    const activeJourneys = sanitizedJourneys.filter((j: any) =>
      ['ACTIVE', 'DELAYED'].includes(j.status)
    );
    const delayedCommutes = activeJourneys.filter((j: any) => j.estimatedDelayMin > 0);
    const avgVerifiedDelayMin =
      sanitizedJourneys.length > 0
        ? Math.round(
            sanitizedJourneys.reduce((acc: number, r: any) => acc + r.verifiedDelayMin, 0) /
              sanitizedJourneys.length
          )
        : 0;

    const incidentsRes = await db.query<any>(
      `SELECT id, title, category, severity, status, road_name, confidence_score, verification_level, estimated_delay_minutes, reported_at, demo_data
       FROM incidents
       WHERE status NOT IN ('REJECTED', 'RESOLVED') AND confidence_score >= 60
       ORDER BY confidence_score DESC
       LIMIT 6`
    );

    // Record audit log for employer dashboard access
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_VIEW_DASHBOARD', 'ORGANIZATION', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        primaryOrgId,
        JSON.stringify({ viewedJourneysCount: sanitizedJourneys.length }),
      ]
    );

    res.json({
      success: true,
      data: {
        organization: orgRes.rows[0],
        policy: policyRes.rows[0] || null,
        metrics: {
          authorizedEmployees: empRes.rows.length,
          activeConsentedJourneys: activeJourneys.length,
          delayedCommutes: delayedCommutes.length,
          avgVerifiedDelayMin,
        },
        activeJourneys: sanitizedJourneys,
        relevantCorridorIncidents: incidentsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/employees
employerRouter.get('/employees', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const empRes = await db.query<any>(
      `SELECT u.id, u.name, u.email, u.role, u.status, om.membership_role, om.created_at as joined_at,
              (SELECT COUNT(*) FROM tracking_consents tc WHERE tc.user_id = u.id AND tc.organization_id = $1 AND tc.revoked_at IS NULL) as active_consents_count,
              (SELECT COUNT(*) FROM journeys j JOIN tracking_consents tc2 ON tc2.id = j.consent_record_id WHERE j.employee_id = u.id AND tc2.organization_id = $1) as total_journeys_count
       FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.membership_role ASC, u.name ASC`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: empRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/journeys (supports CSV export when ?format=csv)
employerRouter.get('/journeys', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.policy_version, tc.purpose as consent_purpose, tc.share_precise_coords
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const items = journeysRes.rows.map((j: any) => ({
      id: j.id,
      employeeName: j.employee_name,
      employeeEmail: j.employee_email,
      origin: j.origin,
      destination: j.destination,
      startedAt: j.started_at,
      endedAt: j.ended_at,
      status: j.status,
      estimatedDelayMin: Number(j.estimated_delay_min || 0),
      verifiedDelayMin: Number(j.verified_delay_min || 0),
      verificationLevel: Number(j.verification_level || 1),
      manualSelfReported: Boolean(j.manual_self_reported),
      consentPolicyVersion: j.policy_version,
      preciseCoordinatesRedacted: !j.share_precise_coords,
      demoData: Boolean(j.demo_data),
    }));

    if (req.query.format === 'csv') {
      const header =
        'JourneyID,EmployeeName,Origin,Destination,StartedAt,EndedAt,Status,EstimatedDelayMin,VerifiedDelayMin,VerificationLevel,SelfReported,DemoData\n';
      const rows = items
        .map(
          (i: any) =>
            `"${i.id}","${i.employeeName}","${i.origin}","${i.destination}","${i.startedAt}","${
              i.endedAt || ''
            }","${i.status}",${i.estimatedDelayMin},${i.verifiedDelayMin},${i.verificationLevel},${
              i.manualSelfReported
            },${i.demoData}`
        )
        .join('\n');

      await db.query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'EMPLOYER_EXPORT_COMMUTE_CSV', 'ORGANIZATION', $3, $4)`,
        [
          crypto.randomUUID(),
          req.user!.userId,
          primaryOrgId,
          JSON.stringify({ exportedRowCount: items.length }),
        ]
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="roadalert-authorized-commute-report.csv"'
      );
      res.send(header + rows);
      return;
    }

    res.json({
      success: true,
      data: items,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/policies
employerRouter.get('/policies', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const polRes = await db.query<any>(
      `SELECT otp.*, o.name as organization_name
       FROM organization_tracking_policies otp
       JOIN organizations o ON o.id = otp.organization_id
       WHERE otp.organization_id = $1`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: polRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/employer/policies/:id
employerRouter.patch('/policies/:id', async (req, res, next) => {
  try {
    const policyId = req.params.id;
    const PolicyUpdateSchema = z.object({
      trackingMode: z.enum(['SESSION_ONLY_EXPLICIT', 'CORRIDOR_CHECKPOINT_ONLY']).optional(),
      retentionDays: z.number().min(1).max(365).optional(),
      requireConsent: z.boolean().optional(),
      allowPreciseCoordinate: z.boolean().optional(),
    });
    const parsed = PolicyUpdateSchema.parse(req.body);

    const existing = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE id = $1`,
      [policyId]
    );
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', 'Organization tracking policy not found');
    }
    const pol = existing.rows[0];
    // Verify organization authorization
    await getAuthorizedOrgIds(req.user!.userId, req.user!.role, pol.organization_id);

    await db.query(
      `UPDATE organization_tracking_policies
       SET tracking_mode = $1,
           retention_days = $2,
           require_consent = $3,
           allow_precise_coordinate = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        parsed.trackingMode ?? pol.tracking_mode,
        parsed.retentionDays ?? pol.retention_days,
        parsed.requireConsent ?? pol.require_consent,
        parsed.allowPreciseCoordinate ?? pol.allow_precise_coordinate,
        policyId,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_POLICY_UPDATED', 'ORGANIZATION_POLICY', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, policyId, JSON.stringify(parsed)]
    );

    const updated = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE id = $1`,
      [policyId]
    );
    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});
