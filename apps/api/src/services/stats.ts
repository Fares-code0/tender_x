import type { Prisma, TenderStatus } from '@prisma/client';
import { TENDER_STATUSES } from '@tender/shared';
import { prisma } from '../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * M7.1 — إحصائيات شاملة من المناقصات وتاريخ حالاتها.
 * `where` اختياري لتقييد النطاق (يُستخدم في التقارير حسب الفترة).
 */
export async function computeAggregateStats(
  where: Prisma.TenderWhereInput = {},
): Promise<AggregateStats> {
  const tenders = await prisma.tender.findMany({
    where,
    select: { id: true, status: true, createdAt: true },
  });

  const byStatus = emptyStatusCounts();
  const monthlyMap = new Map<string, number>();
  for (const t of tenders) {
    byStatus[t.status] += 1;
    const month = t.createdAt.toISOString().slice(0, 7); // YYYY-MM
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + 1);
  }

  const won = byStatus.WON;
  const lost = byStatus.LOST;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  const monthly = [...monthlyMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // متوسط زمن كل مرحلة: من تاريخ الحالات، الفرق بين كل حالة والتي تليها لنفس المناقصة
  const histories = await prisma.tenderStatusHistory.findMany({
    where: Object.keys(where).length ? { tender: where } : {},
    select: { tenderId: true, toStatus: true, createdAt: true },
    orderBy: [{ tenderId: 'asc' }, { createdAt: 'asc' }],
  });

  const durationSum: Record<string, number> = {};
  const durationCount: Record<string, number> = {};
  for (let i = 0; i < histories.length - 1; i++) {
    const cur = histories[i];
    const next = histories[i + 1];
    if (cur.tenderId !== next.tenderId) continue; // آخر حالة لهذه المناقصة (جارية) — تُتخطى
    const status = cur.toStatus;
    const days = (next.createdAt.getTime() - cur.createdAt.getTime()) / DAY_MS;
    durationSum[status] = (durationSum[status] ?? 0) + days;
    durationCount[status] = (durationCount[status] ?? 0) + 1;
  }
  const avgStageDurationDays: Record<string, number> = {};
  for (const status of Object.keys(durationSum)) {
    avgStageDurationDays[status] =
      Math.round((durationSum[status] / durationCount[status]) * 10) / 10;
  }

  return { total: tenders.length, byStatus, winRate, monthly, avgStageDurationDays };
}
