import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requireRoles, signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  AddEmployeeSchema,
  UpdateEmployeeSchema,
  CreateInvitationSchema,
  UpdateOrganizationProfileSchema,
  RegisterCompanySchema,
  UserRole,
} from '@roadalert/shared';
import { evaluateJourneyDelay } from '../services/delayVerificationService.js';

export const employerRouter = Router();

// Public company registration on employer router (also exposed on /auth/register-company)
employerRouter.post('/register-company', async (req, res, next) => {
  try {
    const parsed = RegisterCompanySchema.parse(req.body);
    const emailLower = parsed.adminEmail.toLowerCase().trim();

    const existingUser = await db.query(`SELECT id FROM users WHERE email = $1`, [emailLower]);
    if (existingUser.rows.length > 0) {
      throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this administrator email already exists');
    }

    const orgId = crypto.randomUUID();
    const adminUserId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const policyId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(parsed.adminPassword, 10);

    // 1. Create Organization
    await db.query(
      `INSERT INTO organizations (
        id, name, organization_type, contact_email, contact_phone,
        address, city, default_shift_start, default_shift_end, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE')`,
      [
        orgId,
        parsed.organizationName.trim(),
        parsed.organizationType,
        parsed.contactEmail?.toLowerCase().trim() || emailLower,
        parsed.contactPhone || null,
        parsed.address || null,
        parsed.city || 'Mangaluru',
        parsed.defaultShiftStart || '09:00',
        parsed.defaultShiftEnd || '18:00',
      ]
    );

    // 2. Create Administrator User
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'EMPLOYER', 'ACTIVE')`,
      [adminUserId, parsed.adminName.trim(), emailLower, passwordHash]
    );

    // 3. Create Organization Membership with EMPLOYER_ADMIN role
    await db.query(
      `INSERT INTO organization_memberships (
        id, organization_id, user_id, membership_role, status,
        shift_start_time, shift_end_time
      ) VALUES ($1,$2,$3,'EMPLOYER_ADMIN','ACTIVE',$4,$5)`,
      [
        membershipId,
        orgId,
        adminUserId,
        parsed.defaultShiftStart || '09:00',
        parsed.defaultShiftEnd || '18:00',
      ]
    );

    // 4. Create Default Tracking Policy
    await db.query(
      `INSERT INTO organization_tracking_policies (
        id, organization_id, tracking_mode, retention_days, require_consent, allow_precise_coordinate
      ) VALUES ($1, $2, 'SESSION_ONLY_EXPLICIT', 30, TRUE, FALSE)`,
      [policyId, orgId]
    );

    // 5. Audit Log
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ORGANIZATION_REGISTERED', 'ORGANIZATION', $3, $4)`,
      [
        crypto.randomUUID(),
        adminUserId,
        orgId,
        JSON.stringify({
          organizationName: parsed.organizationName,
          adminEmail: emailLower,
        }),
      ]
    );

    const payload = {
      userId: adminUserId,
      email: emailLower,
      role: 'EMPLOYER' as UserRole,
      name: parsed.adminName.trim(),
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    res.status(201).json({
      success: true,
      data: {
        organization: {
          id: orgId,
          name: parsed.organizationName.trim(),
          organizationType: parsed.organizationType,
          status: 'ACTIVE',
        },
        user: {
          id: adminUserId,
          name: parsed.adminName.trim(),
          email: emailLower,
          role: 'EMPLOYER',
          membershipRole: 'EMPLOYER_ADMIN',
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Protect all following employer routes: require EMPLOYER or ADMIN role
employerRouter.use(authenticate, requireRoles('EMPLOYER', 'ADMIN'));

/**
 * Strict Organization-Level Data Isolation Helper
 * Verifies that the authenticated user is authorized to access the requested organization.
 * Never allows viewing another organization's employees or commute data.
 */
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

  const memRes = await db.query<{ organization_id: string; membership_role: string }>(
    `SELECT organization_id, membership_role FROM organization_memberships
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  const authorizedIds = memRes.rows.map((m) => m.organization_id);

  if (requestedOrgId) {
    if (!authorizedIds.includes(requestedOrgId)) {
      throw new ApiError(
        403,
        'ORGANIZATION_ISOLATION_VIOLATION',
        'Employer is not authorized to access records belonging to another organization'
      );
    }
    return [requestedOrgId, ...authorizedIds.filter((id) => id !== requestedOrgId)];
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
            totalEmployees: 0,
            travellingCount: 0,
            delayedCount: 0,
            verifiedDelaysCount: 0,
            unverifiedDelaysCount: 0,
            avgVerifiedDelayMin: 0,
          },
          activeJourneys: [],
          sampleDisplayJourneys: [],
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

    // Fetch total employees
    const empRes = await db.query<any>(
      `SELECT COUNT(*) as total_employees
       FROM organization_memberships om
       WHERE om.organization_id = $1 AND om.status = 'ACTIVE'`,
      [primaryOrgId]
    );
    const totalEmployees = Number(empRes.rows[0]?.total_employees || 0);

    // Fetch authorized consented journeys
    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.purpose as consent_purpose, tc.share_precise_coords, tc.revoked_at,
              dv.verification_status as delay_verification_status,
              dv.journey_status as delay_journey_status,
              dv.conclusion_text as delay_conclusion_text,
              dv.evidence_summary as delay_evidence_summary_text
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       LEFT JOIN delay_verifications dv ON dv.journey_id = j.id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const allowPrecisePolicy = Boolean(policyRes.rows[0]?.allow_precise_coordinate);

    const sanitizedJourneys = journeysRes.rows.map((j: any) => {
      const canExposeCoords = allowPrecisePolicy && Boolean(j.share_precise_coords);
      const estDelay = Number(j.estimated_delay_min || 0);
      const verDelay = Number(j.verified_delay_min || 0);

      // Determine clean journey status
      let displayStatus = j.journey_display_status || 'Normal';
      if (!j.journey_display_status) {
        if (estDelay >= 30) displayStatus = 'Traffic';
        else if (estDelay > 0) displayStatus = 'Delayed';
        else if (j.status === 'COMPLETED') displayStatus = 'Completed';
        else displayStatus = 'Normal';
      }

      // Verification status
      const verificationStatus = j.delay_verification_status || j.verification_status || (verDelay > 0 ? 'VERIFIED' : 'UNVERIFIED');

      return {
        id: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        employeeEmail: j.employee_email,
        origin: j.origin,
        destination: j.destination,
        route: `${j.origin} → ${j.destination}`,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: displayStatus,
        rawStatus: j.status,
        delayMinutes: estDelay > 0 ? estDelay : verDelay,
        estimatedDelayMin: estDelay,
        verifiedDelayMin: verDelay,
        verificationStatus,
        verificationLevel: Number(j.verification_level || 1),
        conclusionText: j.delay_conclusion_text || j.delay_evidence_summary || null,
        evidenceSummary: j.delay_evidence_summary_text || null,
        manualSelfReported: Boolean(j.manual_self_reported),
        manualStatusNote: j.manual_status_note,
        demoData: Boolean(j.demo_data),
        preciseCoordinatesRedacted: !canExposeCoords,
        lastDataUpdateAt: j.last_data_update_at || j.started_at,
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

    // Compute metric cards
    const travellingJourneys = sanitizedJourneys.filter((j) =>
      ['ACTIVE', 'DELAYED'].includes(j.rawStatus)
    );
    const delayedJourneys = sanitizedJourneys.filter((j) => j.delayMinutes > 0);
    const verifiedDelays = delayedJourneys.filter((j) => j.verificationStatus === 'VERIFIED');
    const unverifiedDelays = delayedJourneys.filter((j) =>
      ['UNVERIFIED', 'NOT_TRAFFIC_RELATED', 'PARTIALLY_VERIFIED'].includes(j.verificationStatus)
    );

    const avgVerifiedDelayMin =
      verifiedDelays.length > 0
        ? Math.round(verifiedDelays.reduce((acc, r) => acc + r.verifiedDelayMin, 0) / verifiedDelays.length)
        : 0;

    // Fetch high-confidence corridor incidents
    const incidentsRes = await db.query<any>(
      `SELECT id, title, category, severity, status, road_name, confidence_score,
              verification_level, estimated_delay_minutes, road_closed, reported_at, demo_data
       FROM incidents
       WHERE status NOT IN ('REJECTED', 'RESOLVED') AND confidence_score >= 50
       ORDER BY confidence_score DESC
       LIMIT 6`
    );

    // Standardized Sample / Display seed records clearly labeled as sample data (Section 3 requirement)
    const sampleDisplayJourneys = [
      {
        id: 'sample-journey-01',
        employee: 'Employee 1 (Sampath Kumar)',
        route: 'Mangaluru–Udupi',
        origin: 'Pumpwell Circle, Mangaluru (NH-66)',
        destination: 'Udupi Karavali Bypass (NH-66)',
        status: 'Traffic',
        delay: '35 min',
        delayMinutes: 35,
        verification: 'Verified',
        verificationStatus: 'VERIFIED',
        isSampleRecord: true,
        evidence: 'Traffic congestion detected at Pumpwell from 8:12 AM to 8:47 AM. Available employee GPS observations indicate that the employee remained within the affected zone during this period.',
      },
      {
        id: 'sample-journey-02',
        employee: 'Employee 2 (Divya Hegde)',
        route: 'Ullal–Mangaluru',
        origin: 'Thokkottu Flyover, Ullal (NH-66)',
        destination: 'Hampankatta / State Bank, Mangaluru',
        status: 'Normal',
        delay: '0 min',
        delayMinutes: 0,
        verification: 'GPS',
        verificationStatus: 'VERIFIED',
        isSampleRecord: true,
        evidence: 'GPS telemetry confirmed uninterrupted transit speeds (avg 48 km/h). Arrival within schedule window.',
      },
      {
        id: 'sample-journey-03',
        employee: 'Employee 3 (Harish Acharya)',
        route: 'Bantwal–Mangaluru',
        origin: 'BC Road, Bantwal (NH-75)',
        destination: 'Pumpwell Circle, Mangaluru (NH-66)',
        status: 'Road Block',
        delay: '60 min',
        delayMinutes: 60,
        verification: 'Verified',
        verificationStatus: 'VERIFIED',
        isSampleRecord: true,
        evidence: 'NHAI culvert emergency stabilization and contraflow roadblock confirmed on corridor by Traffic Authority patrol.',
      },
    ];

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_VIEW_DASHBOARD', 'ORGANIZATION', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        primaryOrgId,
        JSON.stringify({ activeJourneysCount: sanitizedJourneys.length }),
      ]
    );

    res.json({
      success: true,
      data: {
        organization: orgRes.rows[0],
        policy: policyRes.rows[0] || null,
        metrics: {
          totalEmployees,
          travellingCount: travellingJourneys.length,
          delayedCount: delayedJourneys.length,
          verifiedDelaysCount: verifiedDelays.length,
          unverifiedDelaysCount: unverifiedDelays.length,
          avgVerifiedDelayMin,
        },
        activeJourneys: sanitizedJourneys,
        sampleDisplayJourneys,
        relevantCorridorIncidents: incidentsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/profile
employerRouter.get('/profile', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const orgRes = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [primaryOrgId]);
    if (orgRes.rows.length === 0) {
      throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    }

    const policyRes = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE organization_id = $1`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: {
        ...orgRes.rows[0],
        policy: policyRes.rows[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/employer/profile
employerRouter.patch('/profile', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const parsed = UpdateOrganizationProfileSchema.parse(req.body);

    const existing = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [primaryOrgId]);
    if (existing.rows.length === 0) {
      throw new ApiError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    }
    const current = existing.rows[0];

    await db.query(
      `UPDATE organizations
       SET name = $1,
           organization_type = $2,
           contact_email = $3,
           contact_phone = $4,
           address = $5,
           city = $6,
           description = $7,
           default_shift_start = $8,
           default_shift_end = $9,
           updated_at = NOW()
       WHERE id = $10`,
      [
        parsed.name ?? current.name,
        parsed.organizationType ?? current.organization_type,
        parsed.contactEmail !== undefined ? (parsed.contactEmail || null) : current.contact_email,
        parsed.contactPhone !== undefined ? (parsed.contactPhone || null) : current.contact_phone,
        parsed.address !== undefined ? (parsed.address || null) : current.address,
        parsed.city ?? current.city,
        parsed.description !== undefined ? (parsed.description || null) : current.description,
        parsed.defaultShiftStart ?? current.default_shift_start,
        parsed.defaultShiftEnd ?? current.default_shift_end,
        primaryOrgId,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'ORGANIZATION_PROFILE_UPDATED', 'ORGANIZATION', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, primaryOrgId, JSON.stringify(parsed)]
    );

    const updated = await db.query<any>(`SELECT * FROM organizations WHERE id = $1`, [primaryOrgId]);
    res.json({
      success: true,
      data: updated.rows[0],
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

    const { search, status, role } = req.query;
    const conditions: string[] = ['om.organization_id = $1'];
    const params: any[] = [primaryOrgId];

    if (search && String(search).trim() !== '') {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR om.department ILIKE $${params.length})`);
    }

    if (status && status !== 'ALL') {
      params.push(String(status));
      conditions.push(`om.status = $${params.length}`);
    }

    if (role && role !== 'ALL') {
      params.push(String(role));
      conditions.push(`om.membership_role = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const empRes = await db.query<any>(
      `SELECT om.id as membership_id, om.organization_id, om.user_id, om.membership_role,
              om.status, om.department, om.employee_code, om.usual_commute_origin,
              om.usual_commute_destination, om.usual_commute_origin_lat, om.usual_commute_origin_lng,
              om.usual_commute_dest_lat, om.usual_commute_dest_lng, om.usual_commute_corridor,
              om.shift_start_time, om.shift_end_time, om.notes, om.created_at as joined_at,
              u.id as user_id, u.name, u.email, u.role as user_role,
              (SELECT COUNT(*) FROM tracking_consents tc WHERE tc.user_id = u.id AND tc.organization_id = $1 AND tc.revoked_at IS NULL) as active_consents_count,
              (SELECT COUNT(*) FROM journeys j JOIN tracking_consents tc2 ON tc2.id = j.consent_record_id WHERE j.employee_id = u.id AND tc2.organization_id = $1) as total_journeys_count,
              (SELECT j.status FROM journeys j JOIN tracking_consents tc3 ON tc3.id = j.consent_record_id WHERE j.employee_id = u.id AND tc3.organization_id = $1 ORDER BY j.started_at DESC LIMIT 1) as latest_journey_status
       FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE ${whereClause}
       ORDER BY om.membership_role ASC, u.name ASC`,
      params
    );

    res.json({
      success: true,
      data: empRes.rows.map((r: any) => ({
        id: r.user_id,
        membershipId: r.membership_id,
        name: r.name,
        email: r.email,
        userRole: r.user_role,
        membershipRole: r.membership_role,
        status: r.status,
        department: r.department || null,
        employeeCode: r.employee_code || null,
        usualCommuteRoute: r.usual_commute_origin && r.usual_commute_destination
          ? `${r.usual_commute_origin} → ${r.usual_commute_destination}`
          : 'Not configured',
        usualCommuteOrigin: r.usual_commute_origin || null,
        usualCommuteDestination: r.usual_commute_destination || null,
        usualCommuteOriginLat: r.usual_commute_origin_lat,
        usualCommuteOriginLng: r.usual_commute_origin_lng,
        usualCommuteDestLat: r.usual_commute_dest_lat,
        usualCommuteDestLng: r.usual_commute_dest_lng,
        usualCommuteCorridor: r.usual_commute_corridor || null,
        shiftStartTime: r.shift_start_time || '09:00',
        shiftEndTime: r.shift_end_time || '18:00',
        notes: r.notes || null,
        joinedAt: r.joined_at,
        activeConsentsCount: Number(r.active_consents_count || 0),
        totalJourneysCount: Number(r.total_journeys_count || 0),
        latestJourneyStatus: r.latest_journey_status || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/employer/employees — Register or associate employee with organization
employerRouter.post('/employees', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const parsed = AddEmployeeSchema.parse(req.body);
    const emailLower = parsed.email.toLowerCase().trim();

    // Check if user exists
    let userId: string;
    const userRes = await db.query<any>(`SELECT id, role, status FROM users WHERE email = $1`, [emailLower]);

    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;

      // Prevent duplicate employee association
      const memCheck = await db.query(
        `SELECT id, status FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
        [primaryOrgId, userId]
      );
      if (memCheck.rows.length > 0) {
        throw new ApiError(
          409,
          'DUPLICATE_MEMBERSHIP',
          'Employee is already registered or associated with this organization'
        );
      }
    } else {
      // Create new employee user
      userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(parsed.password || 'RoadAlert@2026', 10);
      const userRole = parsed.membershipRole === 'EMPLOYER_ADMIN' || parsed.membershipRole === 'HR_VIEWER'
        ? 'EMPLOYER'
        : 'EMPLOYEE';

      await db.query(
        `INSERT INTO users (id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [userId, parsed.name.trim(), emailLower, passwordHash, userRole]
      );
    }

    const membershipId = crypto.randomUUID();
    await db.query(
      `INSERT INTO organization_memberships (
        id, organization_id, user_id, membership_role, status,
        department, employee_code, usual_commute_origin, usual_commute_destination,
        usual_commute_origin_lat, usual_commute_origin_lng, usual_commute_dest_lat,
        usual_commute_dest_lng, usual_commute_corridor, shift_start_time, shift_end_time, notes
      ) VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        membershipId,
        primaryOrgId,
        userId,
        parsed.membershipRole,
        parsed.department || null,
        parsed.employeeCode || null,
        parsed.usualCommuteOrigin?.trim() || null,
        parsed.usualCommuteDestination?.trim() || null,
        parsed.usualCommuteOriginLat || null,
        parsed.usualCommuteOriginLng || null,
        parsed.usualCommuteDestLat || null,
        parsed.usualCommuteDestLng || null,
        parsed.usualCommuteCorridor?.trim() || null,
        parsed.shiftStartTime || '09:00',
        parsed.shiftEndTime || '18:00',
        parsed.notes?.trim() || null,
      ]
    );

    // Auto-create initial tracking consent record for privacy-first tracking
    const consentId = crypto.randomUUID();
    await db.query(
      `INSERT INTO tracking_consents (
        id, user_id, organization_id, policy_version, purpose, share_precise_coords
      ) VALUES ($1, $2, $3, 'v2026.1-PRIVACY-FIRST', 'Company commute delay verification for registered employee', FALSE)
      ON CONFLICT DO NOTHING`,
      [consentId, userId, primaryOrgId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYEE_ASSOCIATED', 'ORGANIZATION_MEMBERSHIP', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        membershipId,
        JSON.stringify({
          employeeEmail: emailLower,
          membershipRole: parsed.membershipRole,
          organizationId: primaryOrgId,
        }),
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        membershipId,
        userId,
        name: parsed.name.trim(),
        email: emailLower,
        membershipRole: parsed.membershipRole,
        status: 'ACTIVE',
        usualCommuteOrigin: parsed.usualCommuteOrigin || null,
        usualCommuteDestination: parsed.usualCommuteDestination || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/employer/employees/:id — Update employee association or usual commute route
employerRouter.patch('/employees/:id', async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const parsed = UpdateEmployeeSchema.parse(req.body);

    const memRes = await db.query<any>(
      `SELECT * FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [primaryOrgId, targetUserId]
    );

    if (memRes.rows.length === 0) {
      throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', 'Employee membership not found in this organization');
    }

    const cur = memRes.rows[0];

    await db.query(
      `UPDATE organization_memberships
       SET membership_role = $1,
           status = $2,
           department = $3,
           employee_code = $4,
           usual_commute_origin = $5,
           usual_commute_destination = $6,
           usual_commute_origin_lat = $7,
           usual_commute_origin_lng = $8,
           usual_commute_dest_lat = $9,
           usual_commute_dest_lng = $10,
           usual_commute_corridor = $11,
           shift_start_time = $12,
           shift_end_time = $13,
           notes = $14,
           updated_at = NOW()
       WHERE id = $15`,
      [
        parsed.membershipRole ?? cur.membership_role,
        parsed.status ?? cur.status,
        parsed.department !== undefined ? (parsed.department || null) : cur.department,
        parsed.employeeCode !== undefined ? (parsed.employeeCode || null) : cur.employee_code,
        parsed.usualCommuteOrigin !== undefined ? (parsed.usualCommuteOrigin || null) : cur.usual_commute_origin,
        parsed.usualCommuteDestination !== undefined ? (parsed.usualCommuteDestination || null) : cur.usual_commute_destination,
        parsed.usualCommuteOriginLat !== undefined ? parsed.usualCommuteOriginLat : cur.usual_commute_origin_lat,
        parsed.usualCommuteOriginLng !== undefined ? parsed.usualCommuteOriginLng : cur.usual_commute_origin_lng,
        parsed.usualCommuteDestLat !== undefined ? parsed.usualCommuteDestLat : cur.usual_commute_dest_lat,
        parsed.usualCommuteDestLng !== undefined ? parsed.usualCommuteDestLng : cur.usual_commute_dest_lng,
        parsed.usualCommuteCorridor !== undefined ? (parsed.usualCommuteCorridor || null) : cur.usual_commute_corridor,
        parsed.shiftStartTime ?? cur.shift_start_time,
        parsed.shiftEndTime ?? cur.shift_end_time,
        parsed.notes !== undefined ? (parsed.notes || null) : cur.notes,
        cur.id,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYEE_MEMBERSHIP_UPDATED', 'ORGANIZATION_MEMBERSHIP', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, cur.id, JSON.stringify(parsed)]
    );

    const updated = await db.query<any>(
      `SELECT * FROM organization_memberships WHERE id = $1`,
      [cur.id]
    );

    res.json({
      success: true,
      data: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/employer/employees/:id — Deactivate or remove employee association
employerRouter.delete('/employees/:id', async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const memRes = await db.query<any>(
      `SELECT * FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [primaryOrgId, targetUserId]
    );

    if (memRes.rows.length === 0) {
      throw new ApiError(404, 'MEMBERSHIP_NOT_FOUND', 'Employee membership not found in this organization');
    }

    const cur = memRes.rows[0];

    // Remove membership
    await db.query(`DELETE FROM organization_memberships WHERE id = $1`, [cur.id]);

    // Revoke any tracking consents linked to this organization
    await db.query(
      `UPDATE tracking_consents SET revoked_at = NOW() WHERE user_id = $1 AND organization_id = $2`,
      [targetUserId, primaryOrgId]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYEE_REMOVED_FROM_ORGANIZATION', 'ORGANIZATION_MEMBERSHIP', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, cur.id, JSON.stringify({ userId: targetUserId, organizationId: primaryOrgId })]
    );

    res.json({
      success: true,
      data: { message: 'Employee association successfully removed' },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/employer/invitations — Generate employee invitation code
employerRouter.post('/invitations', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const parsed = CreateInvitationSchema.parse(req.body);
    const emailLower = parsed.email.toLowerCase().trim();

    // Check if already active member
    const existing = await db.query<any>(
      `SELECT om.id FROM organization_memberships om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND u.email = $2 AND om.status = 'ACTIVE'`,
      [primaryOrgId, emailLower]
    );
    if (existing.rows.length > 0) {
      throw new ApiError(409, 'ALREADY_MEMBER', 'User with this email is already an active member of your organization');
    }

    const inviteId = crypto.randomUUID();
    const inviteCode = `ROAD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + (parsed.expiresInDays || 7) * 24 * 3600 * 1000);

    await db.query(
      `INSERT INTO organization_invitations (
        id, organization_id, email, invite_code, membership_role,
        department, usual_commute_origin, usual_commute_destination,
        status, created_by, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10)`,
      [
        inviteId,
        primaryOrgId,
        emailLower,
        inviteCode,
        parsed.membershipRole,
        parsed.department || null,
        parsed.usualCommuteOrigin || null,
        parsed.usualCommuteDestination || null,
        req.user!.userId,
        expiresAt.toISOString(),
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYEE_INVITATION_CREATED', 'ORGANIZATION_INVITATION', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, inviteId, JSON.stringify({ email: emailLower, inviteCode })]
    );

    res.status(201).json({
      success: true,
      data: {
        id: inviteId,
        email: emailLower,
        inviteCode,
        membershipRole: parsed.membershipRole,
        expiresAt: expiresAt.toISOString(),
        inviteUrl: `/register?invite=${inviteCode}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/invitations
employerRouter.get('/invitations', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const invRes = await db.query<any>(
      `SELECT oi.*, u.name as created_by_name
       FROM organization_invitations oi
       LEFT JOIN users u ON u.id = oi.created_by
       WHERE oi.organization_id = $1
       ORDER BY oi.created_at DESC`,
      [primaryOrgId]
    );

    res.json({
      success: true,
      data: invRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/employer/invitations/:id
employerRouter.delete('/invitations/:id', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    await db.query(
      `DELETE FROM organization_invitations WHERE id = $1 AND organization_id = $2`,
      [req.params.id, primaryOrgId]
    );

    res.json({
      success: true,
      data: { message: 'Invitation revoked' },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/journeys (supports filters and CSV export)
employerRouter.get('/journeys', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const journeysRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.policy_version, tc.purpose as consent_purpose, tc.share_precise_coords,
              dv.verification_status as delay_verification_status,
              dv.journey_status as delay_journey_status,
              dv.conclusion_text as delay_conclusion_text,
              dv.evidence_summary as delay_evidence_summary_text
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       LEFT JOIN delay_verifications dv ON dv.journey_id = j.id
       WHERE tc.organization_id = $1 AND tc.revoked_at IS NULL
       ORDER BY j.started_at DESC`,
      [primaryOrgId]
    );

    const items = journeysRes.rows.map((j: any) => {
      const estDelay = Number(j.estimated_delay_min || 0);
      const verDelay = Number(j.verified_delay_min || 0);
      const displayStatus = j.journey_display_status || (estDelay > 0 ? 'Traffic' : 'Normal');
      const verStatus = j.delay_verification_status || j.verification_status || (verDelay > 0 ? 'VERIFIED' : 'UNVERIFIED');

      return {
        id: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        employeeEmail: j.employee_email,
        origin: j.origin,
        destination: j.destination,
        route: `${j.origin} → ${j.destination}`,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: displayStatus,
        rawStatus: j.status,
        delayMinutes: estDelay > 0 ? estDelay : verDelay,
        estimatedDelayMin: estDelay,
        verifiedDelayMin: verDelay,
        verificationStatus: verStatus,
        verificationLevel: Number(j.verification_level || 1),
        conclusionText: j.delay_conclusion_text || j.delay_evidence_summary || null,
        evidenceSummary: j.delay_evidence_summary_text || null,
        manualSelfReported: Boolean(j.manual_self_reported),
        consentPolicyVersion: j.policy_version,
        preciseCoordinatesRedacted: !j.share_precise_coords,
        demoData: Boolean(j.demo_data),
        lastDataUpdateAt: j.last_data_update_at || j.started_at,
      };
    });

    if (req.query.format === 'csv') {
      const header =
        'JourneyID,EmployeeName,EmployeeEmail,Route,Status,DelayMinutes,VerificationStatus,VerificationLevel,SelfReported,DemoData,StartedAt\n';
      const rows = items
        .map(
          (i: any) =>
            `"${i.id}","${i.employeeName}","${i.employeeEmail}","${i.route}","${i.status}",${i.delayMinutes},"${i.verificationStatus}",${i.verificationLevel},${i.manualSelfReported},${i.demoData},"${i.startedAt}"`
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

// GET /api/v1/employer/journeys/:id — Detailed view for single employee journey
employerRouter.get('/journeys/:id', async (req, res, next) => {
  try {
    const journeyId = req.params.id;
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const jRes = await db.query<any>(
      `SELECT j.*, u.name as employee_name, u.email as employee_email,
              tc.organization_id, tc.share_precise_coords, tc.policy_version, tc.purpose as consent_purpose,
              om.usual_commute_origin, om.usual_commute_destination, om.shift_start_time, om.shift_end_time,
              om.department
       FROM journeys j
       JOIN tracking_consents tc ON tc.id = j.consent_record_id
       JOIN users u ON u.id = j.employee_id
       LEFT JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = tc.organization_id
       WHERE j.id = $1`,
      [journeyId]
    );

    if (jRes.rows.length === 0) {
      throw new ApiError(404, 'JOURNEY_NOT_FOUND', 'Journey record not found');
    }

    const j = jRes.rows[0];

    // Enforce organization isolation
    if (!orgIds.includes(j.organization_id)) {
      throw new ApiError(
        403,
        'ORGANIZATION_ISOLATION_VIOLATION',
        'Journey does not belong to authorized organization'
      );
    }

    const policyRes = await db.query<any>(
      `SELECT * FROM organization_tracking_policies WHERE organization_id = $1`,
      [j.organization_id]
    );
    const allowPrecise = Boolean(policyRes.rows[0]?.allow_precise_coordinate) && Boolean(j.share_precise_coords);

    // Fetch checkpoints
    const cpRes = await db.query<any>(
      `SELECT * FROM journey_checkpoints WHERE journey_id = $1 ORDER BY recorded_at ASC`,
      [journeyId]
    );

    // Fetch or evaluate delay verification
    let verification: any = null;
    const verRes = await db.query<any>(
      `SELECT * FROM delay_verifications WHERE journey_id = $1 ORDER BY verified_at DESC LIMIT 1`,
      [journeyId]
    );

    if (verRes.rows.length > 0) {
      const v = verRes.rows[0];
      verification = {
        id: v.id,
        verificationStatus: v.verification_status,
        journeyStatus: v.journey_status,
        delayMinutes: Number(v.delay_minutes),
        incidentIds: Array.isArray(v.incident_ids) ? v.incident_ids : JSON.parse(v.incident_ids || '[]'),
        incidentDetails: Array.isArray(v.incident_details) ? v.incident_details : JSON.parse(v.incident_details || '[]'),
        journeyWindowStart: v.journey_window_start,
        journeyWindowEnd: v.journey_window_end,
        evidenceSummary: v.evidence_summary,
        conclusionText: v.conclusion_text,
        verificationMethod: v.verification_method,
        spatialIntersection: Boolean(v.spatial_intersection),
        temporalIntersection: Boolean(v.temporal_intersection),
        gpsObservationSummary: v.gps_observation_summary,
        speedDropDetected: Boolean(v.speed_drop_detected),
        missingEvidenceFactors: Array.isArray(v.missing_evidence_factors)
          ? v.missing_evidence_factors
          : JSON.parse(v.missing_evidence_factors || '[]'),
        verifiedAt: v.verified_at,
      };
    } else {
      // Evaluate automatically
      verification = await evaluateJourneyDelay({ journeyId, organizationId: j.organization_id });
    }

    // Sanitize checkpoints if coordinates are redacted
    const sanitizedCheckpoints = cpRes.rows.map((cp: any) => ({
      id: cp.id,
      recordedAt: cp.recorded_at,
      speed: Number(cp.speed),
      sourceType: cp.source_type,
      statusNote: cp.status_note,
      ...(allowPrecise
        ? { latitude: Number(cp.latitude), longitude: Number(cp.longitude) }
        : { coordinateRedacted: true }),
    }));

    // Record audit log
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_VIEW_JOURNEY_DETAILS', 'JOURNEY', $3, $4)`,
      [crypto.randomUUID(), req.user!.userId, journeyId, JSON.stringify({ employeeId: j.employee_id })]
    );

    res.json({
      success: true,
      data: {
        id: j.id,
        employeeId: j.employee_id,
        employeeName: j.employee_name,
        employeeEmail: j.employee_email,
        department: j.department || null,
        usualCommuteOrigin: j.usual_commute_origin || null,
        usualCommuteDestination: j.usual_commute_destination || null,
        plannedShiftStart: j.shift_start_time || '09:00',
        origin: j.origin,
        destination: j.destination,
        startedAt: j.started_at,
        endedAt: j.ended_at,
        status: j.journey_display_status || j.status,
        rawStatus: j.status,
        estimatedDelayMin: Number(j.estimated_delay_min || 0),
        verifiedDelayMin: Number(j.verified_delay_min || 0),
        verificationStatus: verification?.verificationStatus || j.verification_status || 'UNVERIFIED',
        verificationLevel: Number(j.verification_level || 1),
        manualSelfReported: Boolean(j.manual_self_reported),
        manualStatusNote: j.manual_status_note,
        demoData: Boolean(j.demo_data),
        preciseCoordinatesRedacted: !allowPrecise,
        consentPurpose: j.consent_purpose,
        policyVersion: j.policy_version,
        lastDataUpdateAt: j.last_data_update_at || j.started_at,
        checkpoints: sanitizedCheckpoints,
        verification,
        ...(allowPrecise
          ? {
              originLat: j.origin_lat,
              originLng: j.origin_lng,
              destLat: j.dest_lat,
              destLng: j.dest_lng,
            }
          : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/employer/journeys/:id/verify-delay — Re-evaluate delay verification on demand
employerRouter.post('/journeys/:id/verify-delay', async (req, res, next) => {
  try {
    const journeyId = req.params.id;
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const evaluation = await evaluateJourneyDelay({
      journeyId,
      organizationId: primaryOrgId,
      forceReevaluate: true,
    });

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'EMPLOYER_REEVALUATED_DELAY', 'JOURNEY', $3, $4)`,
      [
        crypto.randomUUID(),
        req.user!.userId,
        journeyId,
        JSON.stringify({ verificationStatus: evaluation.verificationStatus }),
      ]
    );

    res.json({
      success: true,
      data: evaluation,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/employer/verifications — List verification records for organization
employerRouter.get('/verifications', async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId ? String(req.query.organizationId) : undefined;
    const orgIds = await getAuthorizedOrgIds(req.user!.userId, req.user!.role, requestedOrgId);
    const primaryOrgId = orgIds[0];

    const { status } = req.query;
    const conditions = ['dv.organization_id = $1'];
    const params: any[] = [primaryOrgId];

    if (status && status !== 'ALL') {
      params.push(String(status));
      conditions.push(`dv.verification_status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const vRes = await db.query<any>(
      `SELECT dv.*, u.name as employee_name, u.email as employee_email,
              j.origin, j.destination, j.demo_data
       FROM delay_verifications dv
       JOIN users u ON u.id = dv.employee_id
       JOIN journeys j ON j.id = dv.journey_id
       WHERE ${whereClause}
       ORDER BY dv.verified_at DESC`,
      params
    );

    res.json({
      success: true,
      data: vRes.rows.map((v: any) => ({
        id: v.id,
        journeyId: v.journey_id,
        employeeName: v.employee_name,
        employeeEmail: v.employee_email,
        route: `${v.origin} → ${v.destination}`,
        origin: v.origin,
        destination: v.destination,
        verificationStatus: v.verification_status,
        journeyStatus: v.journey_status,
        delayMinutes: Number(v.delay_minutes),
        conclusionText: v.conclusion_text,
        evidenceSummary: v.evidence_summary,
        verifiedAt: v.verified_at,
        demoData: Boolean(v.demo_data),
        incidentIds: Array.isArray(v.incident_ids) ? v.incident_ids : JSON.parse(v.incident_ids || '[]'),
      })),
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
