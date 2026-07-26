import type { TenderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notify } from './notifications';

/** الحالات النشطة التي يهمّها موعد الإغلاق */
const ACTIVE_STATUSES: TenderStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'PROPOSAL_PREPARATION',
  'PENDING_APPROVAL',
];

export const REMINDER_SETTING_KEY = 'closingReminderDays';
const DEFAULT_REMINDER_DAYS = 3;

/** BR-009: عدد أيام التنبيه قابل للتعديل عبر جدول SystemSetting */
export async function getReminderDays(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: REMINDER_SETTING_KEY } });
  const n = setting ? parseInt(setting.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REMINDER_DAYS;
}

/**
 * M6.2 — ينشئ إشعار CLOSING_SOON لكل مناقصة نشطة يقترب موعد إغلاقها خلال X أيام،
 * دون تكرار الإشعار لنفس المناقصة. يعيد عدد الإشعارات المُنشأة.
 * `now` قابل للحقن لتسهيل الاختبار.
 */
export async function runClosingReminders(now: Date = new Date()): Promise<number> {
  const days = await getReminderDays();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const tenders = await prisma.tender.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      closingDate: { gte: now, lte: threshold },
    },
  });

  let created = 0;
  for (const tender of tenders) {
    // عدم تكرار الإشعار لنفس المناقصة
    const existing = await prisma.notification.findFirst({
      where: { tenderId: tender.id, type: 'CLOSING_SOON' },
    });
    if (existing) continue;

    const recipient = tender.currentAssigneeId ?? tender.createdById;
    await notify({
      userId: recipient,
      type: 'CLOSING_SOON',
      tenderId: tender.id,
      message: `يقترب موعد إغلاق المناقصة: ${tender.title}`,
    });
    created += 1;
  }

  return created;
}
