import { Prisma, type TenderStatus } from '@prisma/client';
import { TENDER_STATUSES } from '@tender/shared';
import { prisma } from '../lib/prisma';

export type StatusCounts = Record<TenderStatus, number>;

function emptyStatusCounts(): StatusCounts {
  return TENDER_STATUSES.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as StatusCounts);
}

export interface AggregateStats {
  total: number;
  byStatus: StatusCounts;
  winRate: number | null; // WON / (WON + LOST) — null إن لا توجد نتائج
  monthly: { month: string; count: number }[]; // YYYY-MM حسب تاريخ الإنشاء
  avgStageDurationDays: Record<string, number>; // متوسط أيام البقاء في كل حالة
}

/**
 * H4.1 — مرشّحات صريحة بدل `Prisma.TenderWhereInput` المفتوح، حتى يمكن ترجمتها
 * إلى SQL مجمّع بأمان (بارامترات مُهيّأة) بدل الحساب في الذاكرة.
 */
export interface StatsFilters {
  from?: Date;
  to?: Date;
  createdById?: string;
}

/** يبني شرط Prisma المكافئ للمرشّحات (يُستخدم مع groupBy/count). */
export function statsWhere(f: StatsFilters): Prisma.TenderWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from) createdAt.gte = f.from;
  if (f.to) createdAt.lte = f.to;
  return {
    ...(f.from || f.to ? { createdAt } : {}),
    ...(f.createdById ? { createdById: f.createdById } : {}),
  };
}

/** يبني شرط SQL المكافئ على جدول المناقصات (الاسم المستعار `t`). */
function tenderSqlWhere(f: StatsFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (f.from) conditions.push(Prisma.sql`t."createdAt" >= ${f.from}`);
  if (f.to) conditions.push(Prisma.sql`t."createdAt" <= ${f.to}`);
  if (f.createdById) conditions.push(Prisma.sql`t."createdById" = ${f.createdById}`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

/**
 * H4.1 — أعداد المناقصات حسب الحالة عبر `GROUP BY` في القاعدة
 * (بدل تحميل كل الصفوف وعدّها في JS).
 */
export async function countsByStatus(f: StatsFilters = {}): Promise<StatusCounts> {
  const rows = await prisma.tender.groupBy({
    by: ['status'],
    where: statsWhere(f),
    _count: { _all: true },
  });
  const byStatus = emptyStatusCounts();
  for (const r of rows) byStatus[r.status] = r._count._all;
  return byStatus;
}

/** H4.1 — التوزيع الشهري عبر `date_trunc` في القاعدة. */
async function monthlyCounts(f: StatsFilters): Promise<{ month: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
    SELECT to_char(date_trunc('month', t."createdAt"), 'YYYY-MM') AS month,
           COUNT(*) AS count
    FROM "Tender" t
    ${tenderSqlWhere(f)}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
}

/**
 * H4.1 — متوسط زمن كل مرحلة عبر دالة النافذة `LEAD` في القاعدة:
 * لكل سجل حالة نأخذ تاريخ الحالة التالية لنفس المناقصة، والفرق بينهما هو زمن المرحلة.
 * آخر حالة لكل مناقصة (بلا تالية) تُستثنى — مطابقة للسلوك السابق.
 */
async function avgStageDurations(f: StatsFilters): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ status: string; avg_days: number }[]>`
    SELECT s."toStatus" AS status,
           AVG(EXTRACT(EPOCH FROM (s.next_at - s."createdAt")) / 86400.0) AS avg_days
    FROM (
      SELECT h."toStatus",
             h."createdAt",
             LEAD(h."createdAt") OVER (
               PARTITION BY h."tenderId" ORDER BY h."createdAt"
             ) AS next_at
      FROM "TenderStatusHistory" h
      JOIN "Tender" t ON t.id = h."tenderId"
      ${tenderSqlWhere(f)}
    ) s
    WHERE s.next_at IS NOT NULL
    GROUP BY s."toStatus"
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Math.round(Number(r.avg_days) * 10) / 10;
  return out;
}

/**
 * M7.1 — إحصائيات شاملة من المناقصات وتاريخ حالاتها.
 * H4.1 — كل التجميعات تُنفَّذ في القاعدة؛ لا تُحمَّل صفوف المناقصات/التاريخ إلى الذاكرة.
 */
export async function computeAggregateStats(f: StatsFilters = {}): Promise<AggregateStats> {
  const [byStatus, monthly, avgStageDurationDays] = await Promise.all([
    countsByStatus(f),
    monthlyCounts(f),
    avgStageDurations(f),
  ]);

  const total = TENDER_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
  const won = byStatus.WON;
  const lost = byStatus.LOST;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  return { total, byStatus, winRate, monthly, avgStageDurationDays };
}
