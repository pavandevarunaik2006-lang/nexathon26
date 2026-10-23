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
import { UserRole } from '@roadalert/shared';

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
