import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  authenticate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { UserRole, RegisterCompanySchema, AcceptInvitationSchema } from '@roadalert/shared';

export const authRouter = Router();

const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['PASSENGER', 'EMPLOYEE']).optional().default('PASSENGER'),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// GET /api/v1/auth/invites/:code — Inspect public invite details
authRouter.get('/invites/:code', async (req, res, next) => {
  try {
    const inviteCode = req.params.code.trim();
    const invRes = await db.query<any>(
      `SELECT oi.id, oi.organization_id, oi.email, oi.invite_code, oi.membership_role,
              oi.department, oi.usual_commute_origin, oi.usual_commute_destination,
              oi.status, oi.expires_at, o.name as organization_name
       FROM organization_invitations oi
       JOIN organizations o ON o.id = oi.organization_id
       WHERE oi.invite_code = $1`,
      [inviteCode]
    );

    if (invRes.rows.length === 0) {
      throw new ApiError(404, 'INVITATION_NOT_FOUND', 'Invitation code is invalid or does not exist');
    }

    const inv = invRes.rows[0];
    if (inv.status !== 'PENDING') {
      throw new ApiError(400, 'INVITATION_ALREADY_USED', `Invitation has already been ${inv.status.toLowerCase()}`);
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      throw new ApiError(400, 'INVITATION_EXPIRED', 'This invitation link has expired');
    }

    res.json({
      success: true,
      data: {
        organizationId: inv.organization_id,
        organizationName: inv.organization_name,
        email: inv.email,
        membershipRole: inv.membership_role,
        department: inv.department,
        usualCommuteOrigin: inv.usual_commute_origin,
        usualCommuteDestination: inv.usual_commute_destination,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/accept-invite — Invited employee accepts invitation and registers
authRouter.post('/accept-invite', async (req, res, next) => {
  try {
    const parsed = AcceptInvitationSchema.parse(req.body);
    const inviteCode = parsed.inviteCode.trim();

    const invRes = await db.query<any>(
      `SELECT oi.*, o.name as organization_name
       FROM organization_invitations oi
       JOIN organizations o ON o.id = oi.organization_id
       WHERE oi.invite_code = $1`,
      [inviteCode]
    );

    if (invRes.rows.length === 0) {
      throw new ApiError(404, 'INVITATION_NOT_FOUND', 'Invitation code is invalid or does not exist');
    }

    const inv = invRes.rows[0];
    if (inv.status !== 'PENDING') {
      throw new ApiError(400, 'INVITATION_ALREADY_USED', `Invitation has already been ${inv.status.toLowerCase()}`);
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      throw new ApiError(400, 'INVITATION_EXPIRED', 'This invitation has expired');
    }

    const emailLower = inv.email.toLowerCase().trim();
    let userId: string;

    const userRes = await db.query<any>(`SELECT id FROM users WHERE email = $1`, [emailLower]);
    const passwordHash = await bcrypt.hash(parsed.password, 10);

    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
      // Update password
      await db.query(`UPDATE users SET password_hash = $1, name = $2 WHERE id = $3`, [
        passwordHash,
        parsed.name.trim(),
        userId,
      ]);
    } else {
      userId = crypto.randomUUID();
      const userRole = inv.membership_role === 'EMPLOYER_ADMIN' || inv.membership_role === 'HR_VIEWER' ? 'EMPLOYER' : 'EMPLOYEE';
      await db.query(
        `INSERT INTO users (id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [userId, parsed.name.trim(), emailLower, passwordHash, userRole]
      );
    }

    // Add membership
    const membershipId = crypto.randomUUID();
    await db.query(
      `INSERT INTO organization_memberships (
        id, organization_id, user_id, membership_role, status,
        department, usual_commute_origin, usual_commute_destination
      ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET status = 'ACTIVE', membership_role = $4, updated_at = NOW()`,
      [
        membershipId,
        inv.organization_id,
        userId,
        inv.membership_role,
        inv.department || null,
        inv.usual_commute_origin || null,
        inv.usual_commute_destination || null,
      ]
    );

    // Create consent record
    const consentId = crypto.randomUUID();
    await db.query(
      `INSERT INTO tracking_consents (
        id, user_id, organization_id, policy_version, purpose, share_precise_coords
      ) VALUES ($1, $2, $3, 'v2026.1-PRIVACY-FIRST', 'Company commute delay verification', FALSE)
      ON CONFLICT DO NOTHING`,
      [consentId, userId, inv.organization_id]
    );

    // Mark invitation accepted
    await db.query(`UPDATE organization_invitations SET status = 'ACCEPTED' WHERE id = $1`, [inv.id]);

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'INVITATION_ACCEPTED', 'ORGANIZATION_INVITATION', $3, $4)`,
      [crypto.randomUUID(), userId, inv.id, JSON.stringify({ email: emailLower, organizationId: inv.organization_id })]
    );

    const payload = {
      userId,
      email: emailLower,
      role: (inv.membership_role === 'EMPLOYEE' ? 'EMPLOYEE' : 'EMPLOYER') as UserRole,
      name: parsed.name.trim(),
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: userId,
          name: parsed.name.trim(),
          email: emailLower,
          role: payload.role,
          status: 'ACTIVE',
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/register-company — Company registration & admin user onboarding
authRouter.post('/register-company', async (req, res, next) => {
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

    // 3. Create Membership with EMPLOYER_ADMIN role
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

    // 4. Create Organization Tracking Policy
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

authRouter.post('/register', async (req, res, next) => {
  try {
    // Prevent privilege escalation: registration can only create PASSENGER or EMPLOYEE accounts
    if (req.body?.role && !['PASSENGER', 'EMPLOYEE'].includes(req.body.role)) {
      throw new ApiError(
        403,
        'ROLE_ESCALATION_FORBIDDEN',
        'Self-registration is restricted to PASSENGER or EMPLOYEE roles'
      );
    }
    const parsed = RegisterSchema.parse(req.body);
    const emailLower = parsed.email.toLowerCase().trim();

    const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [emailLower]);
    if (existing.rows.length > 0) {
      throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(parsed.password, 10);

    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [userId, parsed.name.trim(), emailLower, passwordHash, parsed.role]
    );

    await db.query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'USER_REGISTERED', 'USER', $2, $3)`,
      [crypto.randomUUID(), userId, JSON.stringify({ role: parsed.role, email: emailLower })]
    );

    const payload = {
      userId,
      email: emailLower,
      role: parsed.role as UserRole,
      name: parsed.name.trim(),
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
        user: {
          id: userId,
          name: parsed.name.trim(),
          email: emailLower,
          role: parsed.role,
          status: 'ACTIVE',
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const emailLower = parsed.email.toLowerCase().trim();

    const userRes = await db.query<any>(
      `SELECT id, name, email, password_hash, role, status FROM users WHERE email = $1`,
      [emailLower]
    );
    if (userRes.rows.length === 0) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const user = userRes.rows[0];
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Account is suspended or inactive');
    }

    const valid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      name: user.name,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Fetch organization membership if any
    const orgRes = await db.query<any>(
      `SELECT o.id, o.name, o.organization_type, om.membership_role
       FROM organization_memberships om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND om.status = 'ACTIVE'`,
      [user.id]
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          organizations: orgRes.rows,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!token) {
      throw new ApiError(401, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
    }
    const decoded = verifyRefreshToken(token);
    const userRes = await db.query<any>(
      `SELECT id, name, email, role, status FROM users WHERE id = $1`,
      [decoded.userId]
    );
    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'ACTIVE') {
      throw new ApiError(401, 'ACCOUNT_INACTIVE', 'User is no longer active');
    }
    const u = userRes.rows[0];
    const accessToken = signAccessToken({
      userId: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
    });
    res.json({
      success: true,
      data: { accessToken },
    });
  } catch (err) {
    next(new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token'));
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');
  res.json({ success: true, data: { message: 'Logged out successfully' } });
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const userRes = await db.query<any>(
      `SELECT id, name, email, role, status, created_at FROM users WHERE id = $1`,
      [req.user!.userId]
    );
    if (userRes.rows.length === 0) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }
    const orgRes = await db.query<any>(
      `SELECT o.id, o.name, o.organization_type, om.membership_role
       FROM organization_memberships om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND om.status = 'ACTIVE'`,
      [req.user!.userId]
    );
    res.json({
      success: true,
      data: {
        ...userRes.rows[0],
        organizations: orgRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});
