import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { pingSchema } from '@tender/shared';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { getRedisClient, type RedisClient } from './lib/redis';
import { createLimiter } from './lib/rateLimit';
import { authRouter } from './routes/auth';
import { adminUsersRouter } from './routes/adminUsers';
import { tendersRouter } from './routes/tenders';
import { checklistTemplatesRouter } from './routes/checklistTemplates';
import { attachmentsRouter } from './routes/attachments';
import { notificationsRouter } from './routes/notifications';
import { dashboardRouter } from './routes/dashboard';
import { reportsRouter } from './routes/reports';
import { usersRouter } from './routes/users';
import { settingsRouter } from './routes/settings';
import { errorHandler } from './lib/errors';

export function createApp(
  opts: {
    rateLimit?: boolean;
    redis?: RedisClient | null;
    /** تجاوز الحد العام (للاختبارات) */
    globalLimit?: number;
    globalWindowMs?: number;
  } = {},
) {
  // افتراضيًا نعطّل تحديد المعدل في الاختبارات حتى لا يكسر عمليات الدخول المتكررة
  const rateLimitEnabled = opts.rateLimit ?? env.nodeEnv !== 'test';
  // H2.1 — عميل Redis يجعل العدّاد مشتركًا بين النسخ؛ عند غيابه مخزن في الذاكرة
  const redis = opts.redis !== undefined ? opts.redis : getRedisClient();

  const app = express();
  // H0.2 — ضبط trust proxy ليصح req.ip (rate limit) و secure cookie خلف بروكسي/LB
  app.set('trust proxy', env.trustProxyHops);
  // M8.2 — رؤوس أمان + CORS مضبوط على أصل الواجهة مع دعم الكوكيز
  app.use(helmet());
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // H0.4 — فحص حياة العملية (لا يلمس القاعدة)
  app.get('/livez', (_req, res) => {
    res.json({ status: 'live' });
  });

  // H0.4 — فحص جاهزية حقيقي: ينفّذ SELECT 1 عبر Prisma؛ 503 عند تعذّر الوصول للقاعدة
  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unready' });
    }
  });

  // H2.2 — حد عام لكل IP على جميع المسارات (يُستثنى منه فحص الحياة/الجاهزية)
  // H2.1 — يستخدم Redis عند توفره فيكون العدّاد مشتركًا بين كل النسخ
  if (rateLimitEnabled) {
    const globalLimiter = createLimiter({
      windowMs: opts.globalWindowMs ?? env.rateLimitWindowMs,
      limit: opts.globalLimit ?? env.rateLimitMax,
      prefix: 'rl:global:',
      redis,
    });
    app.use((req, res, next) => {
      if (req.path === '/livez' || req.path === '/readyz' || req.path === '/health') return next();
      return globalLimiter(req, res, next);
    });

    // M8.2 — حد أضيق على تسجيل الدخول (حماية من التخمين): 5 محاولات/15 دقيقة → 429
    app.use(
      '/auth/login',
      createLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 5,
        prefix: 'rl:login:',
        redis,
      }),
    );
  }

  // H0.5 — endpoint تجريبي (M0.5) خلف حارس non-prod: غير موجود في الإنتاج
  if (env.nodeEnv !== 'production') {
    app.post('/ping', (req, res) => {
      const parsed = pingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: { code: 'VALIDATION', message: 'بيانات غير صالحة' } });
      }
      res.json({ pong: parsed.data.message });
    });
  }

  app.use('/auth', authRouter);
  app.use('/admin/users', adminUsersRouter);
  app.use('/admin/settings', settingsRouter);
  app.use('/tenders', tendersRouter);
  app.use('/checklist-templates', checklistTemplatesRouter);
  app.use('/attachments', attachmentsRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/reports', reportsRouter);
  app.use('/users', usersRouter);

  app.use(errorHandler);
  return app;
}
