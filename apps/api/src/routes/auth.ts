import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loginSchema } from '@tender/shared';
import * as userRepo from '../repositories/userRepository';
import * as tokenRepo from '../repositories/tokenRepository';
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
    const user = await userRepo.findByEmail(email);
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'هذا الحساب معطّل');

    // H2.3 — الحساب مقفول مؤقتًا بعد محاولات فاشلة متتالية
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        'الحساب مقفول مؤقتًا بسبب محاولات دخول فاشلة، حاول لاحقًا',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      // H2.3 — عدّاد المحاولات الفاشلة؛ عند بلوغ الحد يُقفل الحساب لمدة محددة
      const attempts = user.failedLoginAttempts + 1;
      const reachedLimit = attempts >= env.loginMaxFailedAttempts;
      await userRepo.updateLoginState(user.id, {
        failedLoginAttempts: reachedLimit ? 0 : attempts,
        lockedUntil: reachedLimit
          ? new Date(Date.now() + env.loginLockMinutes * 60 * 1000)
          : user.lockedUntil,
      });
      if (reachedLimit) {
        throw new AppError(
          423,
          'ACCOUNT_LOCKED',
          'الحساب مقفول مؤقتًا بسبب محاولات دخول فاشلة، حاول لاحقًا',
        );
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    }

    // H2.3 — نجاح الدخول يصفّر العدّاد ويرفع القفل
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await userRepo.updateLoginState(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    }

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
          await tokenRepo.revoke(payload.jti, payload.sub ?? '', new Date(payload.exp * 1000));
        }
        // تنظيف كسول: إزالة التوكنات المنتهية من القائمة حتى لا تنمو بلا حد
        await tokenRepo.purgeExpired();
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
