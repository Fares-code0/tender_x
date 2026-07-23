import cron from 'node-cron';
import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { runClosingReminders } from './services/closingReminder';
import { createGracefulShutdown } from './lib/shutdown';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

// M6.2 — تنبيه اقتراب موعد الإغلاق: يوميًا الساعة 08:00
const reminderTask = cron.schedule('0 8 * * *', () => {
  runClosingReminders()
    .then((count) => {
      if (count > 0) console.log(`Closing-reminder job created ${count} notification(s).`);
    })
    .catch((err) => console.error('Closing-reminder job failed:', err));
});

// H0.3 — إيقاف رشيق عند SIGTERM/SIGINT
const shutdown = createGracefulShutdown({
  server,
  prisma,
  tasks: [reminderTask],
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
