import cron from 'node-cron';
import { createApp } from './app';
import { runClosingReminders } from './services/closingReminder';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// M6.2 — تنبيه اقتراب موعد الإغلاق: يوميًا الساعة 08:00
cron.schedule('0 8 * * *', () => {
  runClosingReminders()
    .then((count) => {
      if (count > 0) console.log(`Closing-reminder job created ${count} notification(s).`);
    })
    .catch((err) => console.error('Closing-reminder job failed:', err));
});
