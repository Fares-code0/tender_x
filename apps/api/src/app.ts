import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pingSchema } from '@tender/shared';
import { env } from './lib/env';
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

export function createApp(opts: { rateLimit?: boolean } = {}) {
  // افتراضيًا نعطّل تحديد المعدل في الاختبارات حتى لا يكسر عمليات الدخول المتكررة
  const rateLimitEnabled = opts.rateLimit ?? env.nodeEnv !== 'test';

  const app = express();
  // M8.2 — رؤوس أمان + CORS مضبوط على أصل الواجهة مع دعم الكوكيز
  app.use(helmet());
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // M8.2 — تحديد معدل محاولات تسجيل الدخول (حماية من التخمين): 5 محاولات/15 دقيقة → 429
  if (rateLimitEnabled) {
    app.use(
      '/auth/login',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'محاولات كثيرة، حاول لاحقًا' } },
      }),
    );
  }

  // endpoint تجريبي يثبت مشاركة Zod schemas من @tender/shared (M0.5)
  app.post('/ping', (req, res) => {
    const parsed = pingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: { code: 'VALIDATION', message: 'بيانات غير صالحة' } });
    }
    res.json({ pong: parsed.data.message });
  });

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
