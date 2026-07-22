import { Router } from 'express';
import { updateSettingsSchema } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { validate } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import { getReminderDays, REMINDER_SETTING_KEY } from '../services/closingReminder';

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireRole('ADMIN'));

// M8+ — قراءة إعدادات النظام (Admin)
settingsRouter.get('/', async (_req, res, next) => {
  try {
    const closingReminderDays = await getReminderDays();
    res.json({ settings: { closingReminderDays } });
  } catch (err) {
    next(err);
  }
});

// M8+ — تعديل إعدادات النظام (Admin) — BR-009: أيام التنبيه قابلة للتعديل
settingsRouter.patch('/', async (req, res, next) => {
  try {
    const input = validate(updateSettingsSchema, req.body);
    await prisma.systemSetting.upsert({
      where: { key: REMINDER_SETTING_KEY },
      update: { value: String(input.closingReminderDays) },
      create: { key: REMINDER_SETTING_KEY, value: String(input.closingReminderDays) },
    });
    await logAudit({
      userId: req.user!.id,
      action: 'SETTINGS_UPDATED',
      details: { closingReminderDays: input.closingReminderDays },
    });
    res.json({ settings: { closingReminderDays: input.closingReminderDays } });
  } catch (err) {
    next(err);
  }
});
