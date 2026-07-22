import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { TenderStatus } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

async function makeTender(data: {
  status: TenderStatus;
  createdById: string;
  currentAssigneeId?: string;
  closingInDays?: number;
}) {
  return prisma.tender.create({
    data: {
      title: `t-${Math.random().toString(36).slice(2, 7)}`,
      entity: 'جهة',
      closingDate: new Date(Date.now() + (data.closingInDays ?? 40) * 24 * 60 * 60 * 1000),
      status: data.status,
      createdById: data.createdById,
      currentAssigneeId: data.currentAssigneeId ?? null,
    },
  });
}

describe('GET /dashboard (M7.1)', () => {
  beforeEach(async () => await resetDb());

  it('QA dashboard: qa buckets + charts, no comprehensive stats', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    await makeTender({ status: 'NEW', createdById: qa.id });
    await makeTender({ status: 'UNDER_REVIEW', createdById: qa.id, currentAssigneeId: qa.id });
    await makeTender({ status: 'NEW', createdById: qa.id, closingInDays: 2 }); // قريب الإغلاق

    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('QA');
    expect(res.body.qa).toMatchObject({ newCount: 2, underReviewMineCount: 1 });
    expect(res.body.qa.closingSoonCount).toBeGreaterThanOrEqual(1);
    expect(res.body.statusDistribution).toBeDefined();
    expect(Array.isArray(res.body.monthly)).toBe(true);
    expect(res.body.winRate).toBeNull(); // ليست إحصائيات شاملة لـQA
  });

  it('WRITER dashboard: writer buckets', async () => {
    const qa = await createUser('QA');
    const writer = await createUser('WRITER');
    const cookie = await loginAs(app, writer.email);
    await makeTender({
      status: 'PROPOSAL_PREPARATION',
      createdById: qa.id,
      currentAssigneeId: writer.id,
    });
    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.body.role).toBe('WRITER');
    expect(res.body.writer).toBeDefined();
    expect(res.body.writer.myTasksCount).toBe(1);
    expect(res.body.writer.returnedToMeCount).toBe(0);
  });

  it('MANAGER dashboard: manager buckets + comprehensive stats', async () => {
    const qa = await createUser('QA');
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);
    await makeTender({ status: 'PENDING_APPROVAL', createdById: qa.id });
    await makeTender({ status: 'SUBMITTED', createdById: qa.id });
    await makeTender({ status: 'WON', createdById: qa.id });
    await makeTender({ status: 'LOST', createdById: qa.id });

    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.body.role).toBe('MANAGER');
    expect(res.body.manager).toMatchObject({ pendingApprovalCount: 1, submittedCount: 1 });
    expect(res.body.winRate).toBe(0.5); // WON 1 / (WON 1 + LOST 1)
    expect(res.body.avgStageDurationDays).toBeDefined();
  });

  it('OWNER dashboard: comprehensive stats, no role buckets', async () => {
    const qa = await createUser('QA');
    const owner = await createUser('OWNER');
    const cookie = await loginAs(app, owner.email);
    await makeTender({ status: 'WON', createdById: qa.id });
    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.qa).toBeUndefined();
    expect(res.body.manager).toBeUndefined();
    expect(res.body.winRate).toBe(1);
    expect(res.body.statusDistribution.WON).toBe(1);
  });

  it('requires auth: 401', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(401);
  });
});
