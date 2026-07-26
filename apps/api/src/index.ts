import cron from 'node-cron';
import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { runClosingReminders } from './services/closingReminder';
import { createGracefulShutdown } from './lib/shutdown';
import { closeRedis, getRedisClient } from './lib/redis';
import { logger } from './lib/logger';
import { withLock, LOCK_KEYS } from './lib/lock';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'API listening');
});

// M6.2 — تنبيه اقتراب موعد الإغلاق: يوميًا الساعة 08:00
// H5.2 — خلف قفل موزّع: مع عدة نسخ تعمل المهمة **مرة واحدة** لا مرة لكل نسخة
const reminderTask = cron.schedule('0 8 * * *', () => {
  withLock(getRedisClient(), LOCK_KEYS.closingReminder, () => runClosingReminders())
    .then((count) => {
      if (count === null) {
        logger.debug('Closing-reminder job skipped: another instance holds the lock');
      } else if (count > 0) {
        logger.info({ count }, 'Closing-reminder job created notifications');
      }
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
