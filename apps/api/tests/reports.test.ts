import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { TenderStatus } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

async function makeTenderAt(createdAt: string, status: TenderStatus, createdById: string) {
  return prisma.tender.create({
    data: {
      title: `t-${Math.random().toString(36).slice(2, 7)}`,
      entity: 'جهة',
      closingDate: new Date('2027-01-01T00:00:00.000Z'),
      status,
      createdById,
      createdAt: new Date(createdAt),
    },
  });
}

describe('GET /reports/summary (M7.2)', () => {
  beforeEach(async () => await resetDb());

  it('filters by date range: only in-period tenders counted', async () => {
    const qa = await createUser('QA');
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);

    // داخل الفترة (يونيو 2026)
    await makeTenderAt('2026-06-05T00:00:00.000Z', 'WON', qa.id);
    await makeTenderAt('2026-06-20T00:00:00.000Z', 'LOST', qa.id);
    await makeTenderAt('2026-06-25T00:00:00.000Z', 'SUBMITTED', qa.id);
    // خارج الفترة
    await makeTenderAt('2026-03-01T00:00:00.000Z', 'WON', qa.id);
    await makeTenderAt('2026-09-01T00:00:00.000Z', 'WON', qa.id);

    const res = await request(app)
      .get('/reports/summary?from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.000Z')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.byStatus.WON).toBe(1);
    expect(res.body.byStatus.LOST).toBe(1);
    expect(res.body.byStatus.SUBMITTED).toBe(1);
    expect(res.body.wonLost).toEqual({ won: 1, lost: 1 });

    // أداء المستخدم: أنشأ 3 مناقصات في الفترة
    const qaRow = res.body.byUser.find((u: { userId: string }) => u.userId === qa.id);
    expect(qaRow.tendersCreated).toBe(3);
  });

  it('narrows to a single user with userId', async () => {
    const qa1 = await createUser('QA');
    const qa2 = await createUser('QA');
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);
    await makeTenderAt('2026-06-05T00:00:00.000Z', 'NEW', qa1.id);
    await makeTenderAt('2026-06-06T00:00:00.000Z', 'NEW', qa2.id);

    const res = await request(app).get(`/reports/summary?userId=${qa1.id}`).set('Cookie', cookie);
    expect(res.body.total).toBe(1);
    expect(res.body.byUser).toHaveLength(1);
    expect(res.body.byUser[0].userId).toBe(qa1.id);
  });

  it('rejects non-manager/owner: 403', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app).get('/reports/summary').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});
