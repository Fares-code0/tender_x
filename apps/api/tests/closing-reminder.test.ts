import { describe, it, expect, beforeEach } from 'vitest';
import type { TenderStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { runClosingReminders } from '../src/services/closingReminder';
import { resetDb, createUser } from './helpers/db';

const NOW = new Date('2026-06-01T00:00:00.000Z');

async function makeTender(daysUntilClosing: number, status: TenderStatus = 'UNDER_REVIEW') {
  const qa = await createUser('QA');
  const tender = await prisma.tender.create({
    data: {
      title: `مناقصة ${daysUntilClosing}`,
      entity: 'جهة',
      closingDate: new Date(NOW.getTime() + daysUntilClosing * 24 * 60 * 60 * 1000),
      status,
      createdById: qa.id,
      currentAssigneeId: qa.id,
    },
  });
  return { tender, qa };
}

describe('Closing-reminder job (M6.2)', () => {
  beforeEach(async () => await resetDb());

  it('creates exactly one CLOSING_SOON notification, even when run twice', async () => {
    const { tender, qa } = await makeTender(2); // يغلق بعد يومين (ضمن 3 أيام الافتراضية)

    const first = await runClosingReminders(NOW);
    const second = await runClosingReminders(NOW);
    expect(first).toBe(1);
    expect(second).toBe(0);

    const notifs = await prisma.notification.findMany({
      where: { tenderId: tender.id, type: 'CLOSING_SOON' },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(qa.id); // المسؤول الحالي
  });

  it('ignores tenders whose closing date is beyond the reminder window', async () => {
    const { tender } = await makeTender(30); // بعيد
    const created = await runClosingReminders(NOW);
    expect(created).toBe(0);
    const count = await prisma.notification.count({
      where: { tenderId: tender.id, type: 'CLOSING_SOON' },
    });
    expect(count).toBe(0);
  });

  it('respects the configurable reminder days (BR-009)', async () => {
    await prisma.systemSetting.create({ data: { key: 'closingReminderDays', value: '1' } });
    const { tender } = await makeTender(2); // يغلق بعد يومين، والنافذة يوم واحد → مستبعد
    const created = await runClosingReminders(NOW);
    expect(created).toBe(0);
    const count = await prisma.notification.count({
      where: { tenderId: tender.id, type: 'CLOSING_SOON' },
    });
    expect(count).toBe(0);
  });

  it('ignores closed/inactive tenders (e.g. SUBMITTED)', async () => {
    const { tender } = await makeTender(2, 'SUBMITTED');
    const created = await runClosingReminders(NOW);
    expect(created).toBe(0);
    const count = await prisma.notification.count({ where: { tenderId: tender.id } });
    expect(count).toBe(0);
  });
});
