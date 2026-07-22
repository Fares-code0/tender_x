import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { TENDER_STATUSES } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { validate } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('MANAGER', 'OWNER', 'ADMIN'));

const reportFiltersSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  userId: z.string().trim().min(1).optional(),
});

// M7.2 — تقرير ملخّص: أعداد حسب الحالة + فوز/خسارة + أداء كل مستخدم في الفترة
reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const f = validate(reportFiltersSchema, req.query);

    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = f.from;
    if (f.to) createdAt.lte = f.to;
    const dateWhere = f.from || f.to ? { createdAt } : {};

    const tenderWhere: Prisma.TenderWhereInput = {
      ...dateWhere,
      ...(f.userId ? { createdById: f.userId } : {}),
    };

    const tenders = await prisma.tender.findMany({
      where: tenderWhere,
      select: { status: true },
    });

    const byStatus = TENDER_STATUSES.reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<string, number>,
    );
    for (const t of tenders) byStatus[t.status] += 1;
    const wonLost = { won: byStatus.WON, lost: byStatus.LOST };

    // الأداء لكل مستخدم في الفترة: المُنشأ + تغييرات الحالة المنفَّذة
    const users = await prisma.user.findMany({
      where: f.userId ? { id: f.userId } : {},
      select: { id: true, name: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    const byUser = await Promise.all(
      users.map(async (u) => {
        const [tendersCreated, statusChanges] = await Promise.all([
          prisma.tender.count({ where: { ...dateWhere, createdById: u.id } }),
          prisma.tenderStatusHistory.count({
            where: { ...dateWhere, changedById: u.id },
          }),
        ]);
        return { userId: u.id, name: u.name, role: u.role, tendersCreated, statusChanges };
      }),
    );

    res.json({
      from: f.from ?? null,
      to: f.to ?? null,
      userId: f.userId ?? null,
      total: tenders.length,
      byStatus,
      wonLost,
      byUser,
    });
  } catch (err) {
    next(err);
  }
});
