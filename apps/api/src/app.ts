import crypto from 'node:crypto';
import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { pingSchema } from '@tender/shared';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { getRedisClient, type RedisClient } from './lib/redis';
import { createLimiter } from './lib/rateLimit';
import swaggerUi from 'swagger-ui-express';
import { API_V1, UNVERSIONED_PATHS } from './lib/apiVersion';
import { buildOpenApiDocument } from './openapi';
import { logger as defaultLogger } from './lib/logger';
import { createMetrics, routeLabel, type Metrics } from './lib/metrics';
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
    /** حاقن للسجلّ والمقاييس (للاختبارات) */
    logger?: Logger;
    metrics?: Metrics;
  } = {},
) {
  // افتراضيًا نعطّل تحديد المعدل في الاختبارات حتى لا يكسر عمليات الدخول المتكررة
  const rateLimitEnabled = opts.rateLimit ?? env.nodeEnv !== 'test';
  // H2.1 — عميل Redis يجعل العدّاد مشتركًا بين النسخ؛ عند غيابه مخزن في الذاكرة
  const redis = opts.redis !== undefined ? opts.redis : getRedisClient();
  const logger = opts.logger ?? defaultLogger;
  // H3.3 — سجل مقاييس مستقل لكل تطبيق (يمنع تضارب التسجيل بين الاختبارات)
  const metrics = opts.metrics ?? createMetrics();

  const app = express();
  // H0.2 — ضبط trust proxy ليصح req.ip (rate limit) و secure cookie خلف بروكسي/LB
  app.set('trust proxy', env.trustProxyHops);

  // H3.1/H3.2 — تسجيل منظّم لكل طلب + معرّف ارتباط (x-request-id) قابل للتتبّع
  app.use(
    pinoHttp({
      logger,
      // يحترم المعرّف القادم من البروكسي/العميل، وإلا يولّد واحدًا
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
        // يُعاد للعميل حتى يستطيع ربط استجابته بسجلاتنا
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // H3.3 — قياس كل طلب (RED): عدّاد + هيستوغرام زمن الاستجابة
  app.use((req, res, next) => {
    const stopTimer = metrics.httpRequestDuration.startTimer();
    res.on('finish', () => {
      // يُحسب بعد التوجيه حتى نحصل على قالب المسار (`/tenders/:id`) لا القيمة الفعلية
      const labels = {
        method: req.method,
        route: routeLabel(req),
        status: String(res.statusCode),
      };
      metrics.httpRequestsTotal.inc(labels);
      stopTimer(labels);
    });
    next();
  });

  // H3.3 — كشف المقاييس لـPrometheus (خارج تحديد المعدل: الكاشط يستدعيه دوريًا)
  app.get('/metrics', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', metrics.registry.contentType);
      res.send(await metrics.registry.metrics());
    } catch (err) {
      next(err);
    }
  });

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
    const unlimitedPaths = new Set<string>(UNVERSIONED_PATHS);
    app.use((req, res, next) => {
      if (unlimitedPaths.has(req.path)) return next();
      return globalLimiter(req, res, next);
    });

    // M8.2 — حد أضيق على تسجيل الدخول (حماية من التخمين): 5 محاولات/15 دقيقة → 429
    app.use(
      `${API_V1}/auth/login`,
      createLimiter({
        windowMs: env.loginRateLimitWindowMs,
        limit: env.loginRateLimitMax,
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

  // H6.4 — توثيق حيّ مُولَّد من مخططات Zod نفسها (لا يمكن أن ينحرف عن السلوك)
  if (env.docsEnabled) {
    const openApiDocument = buildOpenApiDocument();
    app.get('/openapi.json', (_req, res) => {
      res.json(openApiDocument);
    });
    // Swagger UI يحتاج سكربتات/أنماطًا مضمّنة؛ سياسة helmet الافتراضية تمنعها
    // فتظهر الصفحة بيضاء بصمت. نخفّف السياسة **لهذا المسار وحده** لا عالميًا.
    app.use(
      '/docs',
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
          },
        },
      }),
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument),
    );
  }

  // H6.3 — كل واجهة العمل تحت `/v1` حتى يمكن تقديم `/v2` لاحقًا بلا كسر العملاء.
  // فحوص البنية (`/health`, `/livez`, `/readyz`, `/metrics`) تبقى بلا نسخة عمدًا:
  // هي عقد مع المنسّق/الكاشط لا مع عملاء الـAPI، ولا يصح أن تتغيّر مع نسخة الواجهة.
  const v1 = Router();
  v1.use('/auth', authRouter);
  v1.use('/admin/users', adminUsersRouter);
  v1.use('/admin/settings', settingsRouter);
  v1.use('/tenders', tendersRouter);
  v1.use('/checklist-templates', checklistTemplatesRouter);
  v1.use('/attachments', attachmentsRouter);
  v1.use('/notifications', notificationsRouter);
  v1.use('/dashboard', dashboardRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/users', usersRouter);
  app.use(API_V1, v1);

  app.use(errorHandler);
  return app;
}
