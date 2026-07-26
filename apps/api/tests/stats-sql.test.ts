import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { createApp } from '../src/app';
import { resetDb, createUser, loginAs } from './helpers/db';
import { computeAggregateStats, countsByStatus, type StatsFilters } from '../src/services/stats';
import { TENDER_STATUSES } from '@tender/shared';
import type { TenderStatus } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const app = createApp();

/**
 * التنفيذ المرجعي القديم (تحميل كل الصفوف والحساب في الذاكرة).
 * يبقى في الاختبار فقط كمرجع مطابقة للنسخة المجمّعة في SQL — H4.1.
 */
async function computeInMemory(f: StatsFilters = {}) {
  const createdAt: Record<string, Date> = {};
  if (f.from) createdAt.gte = f.from;
  if (f.to) createdAt.lte = f.to;
  const where = {
    ...(f.from || f.to ? { createdAt } : {}),
    ...(f.createdById ? { createdById: f.createdById } : {}),
  };

  const tenders = await prisma.tender.findMany({
    where,
    select: { id: true, status: true, createdAt: true },
  });

  const byStatus = TENDER_STATUSES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<TenderStatus, number>,
  );
  const monthlyMap = new Map<string, number>();
  for (const t of tenders) {
    byStatus[t.status] += 1;
    const month = t.createdAt.toISOString().slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + 1);
  }

  const won = byStatus.WON;
  const lost = byStatus.LOST;
  const winRate = won + lost > 0 ? won / (won + lost) : null;
  const monthly = [...monthlyMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const histories = await prisma.tenderStatusHistory.findMany({
    where: Object.keys(where).length ? { tender: where } : {},
    select: { tenderId: true, toStatus: true, createdAt: true },
    orderBy: [{ tenderId: 'asc' }, { createdAt: 'asc' }],
  });

  const sum: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (let i = 0; i < histories.length - 1; i++) {
    const cur = histories[i];
    const next = histories[i + 1];
    if (cur.tenderId !== next.tenderId) continue;
    const days = (next.createdAt.getTime() - cur.createdAt.getTime()) / DAY_MS;
    sum[cur.toStatus] = (sum[cur.toStatus] ?? 0) + days;
    count[cur.toStatus] = (count[cur.toStatus] ?? 0) + 1;
  }
  const avgStageDurationDays: Record<string, number> = {};
  for (const s of Object.keys(sum)) {
    avgStageDurationDays[s] = Math.round((sum[s] / count[s]) * 10) / 10;
  }

  return { total: tenders.length, byStatus, winRate, monthly, avgStageDurationDays };
}

/** يزرع مناقصات بحالات وتواريخ متنوّعة + تاريخ حالات لحساب أزمنة المراحل */
async function seed() {
  const author = await createUser('QA');
  const other = await createUser('WRITER');

  const spec: { status: TenderStatus; createdAt: Date; owner: string }[] = [
    { status: 'NEW', createdAt: new Date('2026-01-10T00:00:00Z'), owner: author.id },
    { status: 'NEW', createdAt: new Date('2026-01-20T00:00:00Z'), owner: other.id },
    { status: 'UNDER_REVIEW', createdAt: new Date('2026-02-05T00:00:00Z'), owner: author.id },
    { status: 'WON', createdAt: new Date('2026-02-15T00:00:00Z'), owner: author.id },
    { status: 'WON', createdAt: new Date('2026-03-01T00:00:00Z'), owner: other.id },
    { status: 'LOST', createdAt: new Date('2026-03-11T00:00:00Z'), owner: author.id },
    { status: 'SUBMITTED', createdAt: new Date('2026-04-02T00:00:00Z'), owner: other.id },
  ];

  const ids: string[] = [];
  for (const [i, s] of spec.entries()) {
    const t = await prisma.tender.create({
      data: {
        title: `مناقصة ${i}`,
        entity: 'جهة',
        closingDate: new Date('2026-12-01T00:00:00Z'),
        status: s.status,
        createdById: s.owner,
        createdAt: s.createdAt,
      },
      select: { id: true },
    });
    ids.push(t.id);

    // سلسلة حالات بفواصل زمنية مختلفة لكل مناقصة
    const steps: { to: TenderStatus; offsetDays: number }[] = [
      { to: 'NEW', offsetDays: 0 },
      { to: 'UNDER_REVIEW', offsetDays: 2 + (i % 3) },
      { to: 'PROPOSAL_PREPARATION', offsetDays: 5 + (i % 4) },
    ];
    for (const step of steps) {
      await prisma.tenderStatusHistory.create({
        data: {
          tenderId: t.id,
          fromStatus: null,
          toStatus: step.to,
          changedById: s.owner,
          createdAt: new Date(s.createdAt.getTime() + step.offsetDays * DAY_MS),
        },
      });
    }
  }
  return { author, other, ids };
}

describe('SQL aggregation matches the in-memory computation (H4.1)', () => {
  beforeEach(async () => await resetDb());

  it('produces identical stats with no filter', async () => {
    await seed();

    const sql = await computeAggregateStats();
    const reference = await computeInMemory();

    expect(sql.total).toBe(reference.total);
    expect(sql.byStatus).toEqual(reference.byStatus);
    expect(sql.winRate).toBe(reference.winRate);
    expect(sql.monthly).toEqual(reference.monthly);
    expect(sql.avgStageDurationDays).toEqual(reference.avgStageDurationDays);
  });

  it('produces identical stats for a date range', async () => {
    await seed();
    const f: StatsFilters = {
      from: new Date('2026-02-01T00:00:00Z'),
      to: new Date('2026-03-31T23:59:59Z'),
    };

    const sql = await computeAggregateStats(f);
    const reference = await computeInMemory(f);

    expect(sql.total).toBe(reference.total);
    expect(sql.byStatus).toEqual(reference.byStatus);
    expect(sql.monthly).toEqual(reference.monthly);
    expect(sql.avgStageDurationDays).toEqual(reference.avgStageDurationDays);
    // تأكيد أن المرشّح فعّال حقًّا (وإلا لكان الاختبار بلا معنى)
    expect(sql.total).toBeLessThan((await computeAggregateStats()).total);
  });

  it('produces identical stats when filtered by creator', async () => {
    const { author } = await seed();
    const f: StatsFilters = { createdById: author.id };

    const sql = await computeAggregateStats(f);
    const reference = await computeInMemory(f);

    expect(sql.total).toBe(reference.total);
    expect(sql.byStatus).toEqual(reference.byStatus);
    expect(sql.monthly).toEqual(reference.monthly);
    expect(sql.avgStageDurationDays).toEqual(reference.avgStageDurationDays);
  });

  it('returns zeroed stats on an empty dataset', async () => {
    const stats = await computeAggregateStats();
    expect(stats.total).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.monthly).toEqual([]);
    expect(stats.avgStageDurationDays).toEqual({});
    expect(Object.values(stats.byStatus).every((v) => v === 0)).toBe(true);
  });

  it('countsByStatus aggregates in the database', async () => {
    await seed();
    const counts = await countsByStatus();
    expect(counts.NEW).toBe(2);
    expect(counts.WON).toBe(2);
    expect(counts.LOST).toBe(1);
    expect(counts.SUBMITTED).toBe(1);
  });
});

describe('User report is not N+1 (H4.2)', () => {
  const captured: string[] = [];
  let recording = false;

  // مستمع واحد لكل الملف (لا واجهة لإزالة المستمعين في Prisma) ونتحكّم عبر العلم
  prisma.$on('query', (e) => {
    if (recording) captured.push(e.query);
  });

  beforeEach(async () => await resetDb());

  /**
   * نعدّ جُمل SQL الفعلية المنفَّذة أثناء الطلب (عبر أحداث Prisma) لا استدعاءات JS —
   * التجسّس على دوال Prisma يكسر العميل، وعدّ SQL الحقيقي أدقّ على أي حال.
   */
  async function callSummary(userCount: number) {
    const manager = await createUser('MANAGER');
    for (let i = 0; i < userCount; i++) await createUser('QA');
    const cookie = await loginAs(app, manager.email);

    captured.length = 0;
    recording = true;
    const res = await request(app).get('/reports/summary').set('Cookie', cookie);
    // أحداث الاستعلام غير متزامنة — امنحها فرصة للوصول قبل القياس
    await new Promise((r) => setTimeout(r, 100));
    recording = false;

    expect(res.status).toBe(200);
    return { queries: captured.length, users: res.body.byUser.length as number };
  }

  it('issues the same number of SQL queries for 2 users as for 12', async () => {
    const few = await callSummary(2);
    await resetDb();
    const many = await callSummary(12);

    // حارس ضد نجاح فارغ: لا بد أن نكون قد التقطنا استعلامات فعلًا
    expect(few.queries).toBeGreaterThan(0);
    // العدد الفعلي للمستخدمين ارتفع…
    expect(many.users).toBeGreaterThan(few.users);
    // …وعدد الاستعلامات لم يتغيّر: التجميع يتم في القاعدة (كان O(2N) سابقًا)
    expect(many.queries).toBe(few.queries);
    // ويبقى صغيرًا ومحدودًا مهما كثر المستخدمون
    expect(many.queries).toBeLessThan(10);
  });

  it('still reports correct per-user numbers', async () => {
    const manager = await createUser('MANAGER');
    const qa = await createUser('QA');
    await prisma.tender.create({
      data: {
        title: 'مناقصة',
        entity: 'جهة',
        closingDate: new Date('2026-12-01T00:00:00Z'),
        createdById: qa.id,
      },
    });

    const cookie = await loginAs(app, manager.email);
    const res = await request(app).get('/reports/summary').set('Cookie', cookie);

    const row = res.body.byUser.find((u: { userId: string }) => u.userId === qa.id);
    expect(row.tendersCreated).toBe(1);
    const managerRow = res.body.byUser.find((u: { userId: string }) => u.userId === manager.id);
    expect(managerRow.tendersCreated).toBe(0);
  });
});
