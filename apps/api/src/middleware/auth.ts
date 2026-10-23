import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@roadalert/shared';
import { db } from '../db/index.js';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'roadalert_dev_access_secret_key_2026_nexathon';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'roadalert_dev_refresh_secret_key_2026_nexathon';

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '2h' });
}

export function signRefreshToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as AuthTokenPayload;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication token is required' },
      });
      return;
    }

    const decoded = jwt.verify(token, ACCESS_SECRET) as AuthTokenPayload;
    // Verify user status in database
    const userRes = await db.query<{ status: string; role: UserRole }>(
      `SELECT status, role FROM users WHERE id = $1`,
      [decoded.userId]
    );
    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'User account is inactive or does not exist' },
      });
      return;
    }

    req.user = {
      ...decoded,
      role: userRes.rows[0].role,
    };
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token' },
    });
  }
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
        },
      });
      return;
    }
    next();
  };
}
