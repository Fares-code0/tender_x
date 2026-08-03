import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { loginSchema } from '@tender/shared';
import * as userRepo from '../repositories/userRepository';
import * as tokenRepo from '../repositories/tokenRepository';
import { AppError, validate } from '../lib/errors';
import { env } from '../lib/env';
import { lockDurationMs } from '../services/loginThrottle';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const COOKIE_NAME = 'token';

/**
 * S2 — تجزئة وهمية لمعادلة زمن الردّ.
 *
 * بدونها يعود الطلب على بريد غير مسجَّل **قبل** أن يُستدعى bcrypt (≈3ms)، بينما
 * بريد مسجَّل بكلمة مرور خاطئة يدفع كلفة التجزئة كاملة (≈80ms). الفارق ٢٦ ضعفًا
 * يجعل نموذج الدخول العام أداة تعداد: يجرّب المهاجم بُرد الموظفين فيعرف من الزمن
 * وحده أيها مسجَّل — ثم يوجّه إليها القفل أو التخمين.
 *
 * توحيد الرسالة والرمز وحده لا يكفي؛ لا بد أن تُدفع الكلفة نفسها في المسارين.
 * التكلفة 12 مطابقة لتكلفة تجزئة كلمات المرور الفعلية (راجع `adminUsers.ts`)،
 * وإلا اختلف الزمن مجددًا. القيمة تجزئة لسلسلة عشوائية لا يعرفها أحد، وليست
 * سرًّا: لا تُقارن إلا بكلمة مرور مآلها الرفض في كل الأحوال.
 */
const DUMMY_PASSWORD_HASH = '$2b$12$GxyTY9FEIAgTJJiFhQmSRuRiBYOAbjgrZT4S68np/XNEzxxhsZoYm';

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
    if (!user) {
      // S2 — ندفع كلفة التجزئة نفسها قبل الرفض حتى لا يميّز الزمنُ المسجَّلَ
      // من غير المسجَّل. النتيجة مُهمَلة عمدًا: الردّ واحد في كل الأحوال.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    }
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
      // H2.3 / S4 — العدّاد **تراكمي** لا يُصفَّر عند بلوغ الحد: هو أساس التصاعد،
      // فتصفيره كان يعيد كل جولة إلى نافذة البداية نفسها مهما تكرّر الهجوم.
      const attempts = user.failedLoginAttempts + 1;
      const lockMs = lockDurationMs(attempts);
      await userRepo.updateLoginState(user.id, {
        failedLoginAttempts: attempts,
        lockedUntil: lockMs > 0 ? new Date(Date.now() + lockMs) : user.lockedUntil,
      });
      if (lockMs > 0) {
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
