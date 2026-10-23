import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserRole } from '@roadalert/shared';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { RegisterUserSchema, LoginUserSchema } from '../validators/index.js';
import {
  findUserByEmail,
  findUserById,
  getUserOrganizations,
  createUserRecord,
} from '../repositories/userRepository.js';
import { recordAuditLog } from '../repositories/auditRepository.js';

export async function registerUser(rawBody: any) {
  if (rawBody?.role && !['PASSENGER', 'EMPLOYEE'].includes(rawBody.role)) {
    throw new ApiError(
      403,
      'ROLE_ESCALATION_FORBIDDEN',
      'Self-registration is restricted to PASSENGER or EMPLOYEE roles'
    );
  }

  const parsed = RegisterUserSchema.parse(rawBody);
  const emailLower = parsed.email.toLowerCase().trim();

  const existing = await findUserByEmail(emailLower);
  if (existing) {
    throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
  }

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(parsed.password, 10);

  await createUserRecord({
    id: userId,
    name: parsed.name.trim(),
    email: emailLower,
    passwordHash,
    role: parsed.role as UserRole,
  });

  await recordAuditLog({
    actorId: userId,
    action: 'USER_REGISTERED',
    entityType: 'USER',
    entityId: userId,
    metadata: { role: parsed.role, email: emailLower },
  });

  const payload = {
    userId,
    email: emailLower,
    role: parsed.role as UserRole,
    name: parsed.name.trim(),
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return {
    user: {
      id: userId,
      name: parsed.name.trim(),
      email: emailLower,
      role: parsed.role,
      status: 'ACTIVE',
    },
    accessToken,
    refreshToken,
  };
}

export async function loginUser(rawBody: any) {
  const parsed = LoginUserSchema.parse(rawBody);
  const emailLower = parsed.email.toLowerCase().trim();

  const user = await findUserByEmail(emailLower);
  if (!user) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

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
  const organizations = await getUserOrganizations(user.id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      organizations,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(token?: string) {
  if (!token) {
    throw new ApiError(401, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
  }

  try {
    const decoded = verifyRefreshToken(token);
    const u = await findUserById(decoded.userId);
    if (!u || u.status !== 'ACTIVE') {
      throw new ApiError(401, 'ACCOUNT_INACTIVE', 'User is no longer active');
    }

    const accessToken = signAccessToken({
      userId: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
    });
    return { accessToken };
  } catch {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }
}

export async function getAuthenticatedProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const organizations = await getUserOrganizations(userId);
  return {
    ...user,
    organizations,
  };
}
