import cron from 'node-cron';
import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { runClosingReminders } from './services/closingReminder';
import { createGracefulShutdown } from './lib/shutdown';
import { closeRedis } from './lib/redis';
import { logger } from './lib/logger';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'API listening');
});

// M6.2 — تنبيه اقتراب موعد الإغلاق: يوميًا الساعة 08:00
const reminderTask = cron.schedule('0 8 * * *', () => {
  runClosingReminders()
    .then((count) => {
      if (count > 0) logger.info({ count }, 'Closing-reminder job created notifications');
    })
    .catch((err) => logger.error({ err }, 'Closing-reminder job failed'));
});

// H0.3 — إيقاف رشيق عند SIGTERM/SIGINT
const shutdown = createGracefulShutdown({
  server,
  prisma,
  tasks: [reminderTask],
  // H2.1 — أغلق اتصال Redis ضمن الإيقاف الرشيق
  closers: [closeRedis],
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
