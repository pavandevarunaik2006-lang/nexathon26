import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  handleRegister,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleGetMe,
} from '../controllers/authController.js';

export const authRouter = Router();

authRouter.post('/register', handleRegister);
authRouter.post('/login', handleLogin);
authRouter.post('/refresh', handleRefresh);
authRouter.post('/logout', handleLogout);
authRouter.get('/me', authenticate, handleGetMe);
