import { Request, Response, NextFunction } from 'express';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  getAuthenticatedProfile,
} from '../services/authService.js';

export async function handleRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await registerUser(req.body);
    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function handleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await loginUser(req.body);
    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function handleRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body?.refreshToken || req.cookies?.refreshToken;
    const data = await refreshAccessToken(token);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export function handleLogout(_req: Request, res: Response) {
  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');
  res.json({ success: true, data: { message: 'Logged out successfully' } });
}

export async function handleGetMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAuthenticatedProfile(req.user!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
