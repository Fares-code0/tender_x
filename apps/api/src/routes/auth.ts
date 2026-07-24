import crypto from 'node:crypto';
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

// خيارات الكوكي المشتركة بين الضبط والمسح — يجب أن تتطابق وإلا لا يمسحها المتصفح
// H1.2 — sameSite=strict لطلبات التغيير (حماية CSRF لتطبيق داخلي)
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: env.nodeEnv === 'production',
  path: '/',
};

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = validate(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'هذا الحساب معطّل');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');

    // H1.3 — jti فريد لكل توكن حتى يمكن إبطاله لاحقًا عبر denylist
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
      jwtid: jti,
    });
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// H1.3 — logout يُبطل التوكن فعليًا (يضيف jti إلى denylist) لا يكتفي بمسح الكوكي
authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) {
      try {
        const payload = jwt.verify(token, env.jwtSecret) as {
          jti?: string;
          sub?: string;
          exp?: number;
        };
        if (payload.jti && payload.exp) {
          await prisma.revokedToken.upsert({
            where: { jti: payload.jti },
            create: {
              jti: payload.jti,
              userId: payload.sub ?? '',
              expiresAt: new Date(payload.exp * 1000),
            },
            update: {},
          });
        }
        // تنظيف كسول: إزالة التوكنات المنتهية من القائمة حتى لا تنمو بلا حد
        await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      } catch {
        // توكن غير صالح/منتهٍ — لا شيء لإبطاله
      }
    }
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
