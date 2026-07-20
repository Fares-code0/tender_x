import express from 'express';
import cookieParser from 'cookie-parser';
import { pingSchema } from '@tender/shared';
import { authRouter } from './routes/auth';
import { adminUsersRouter } from './routes/adminUsers';
import { errorHandler } from './lib/errors';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

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

  app.use(errorHandler);
  return app;
}
