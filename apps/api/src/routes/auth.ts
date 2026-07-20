import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loginSchema } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError, validate } from '../lib/errors';
import { env } from '../lib/env';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const COOKIE_NAME = 'token';

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = validate(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'هذا الحساب معطّل');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');

    const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
