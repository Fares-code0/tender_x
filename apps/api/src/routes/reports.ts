import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { TENDER_STATUSES } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { validate } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { countsByStatus } from '../services/stats';

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

    // H4.1 — العدّ حسب الحالة يتم في القاعدة (GROUP BY) لا بتحميل كل الصفوف
    const byStatus = await countsByStatus({
      from: f.from,
      to: f.to,
      createdById: f.userId,
    });
    const total = TENDER_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
    const wonLost = { won: byStatus.WON, lost: byStatus.LOST };

    // الأداء لكل مستخدم في الفترة: المُنشأ + تغييرات الحالة المنفَّذة
    const users = await prisma.user.findMany({
      where: f.userId ? { id: f.userId } : {},
      select: { id: true, name: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    // H4.2 — استعلامان مجمّعان بدل استعلامين لكل مستخدم (O(1) بدل O(2N))
    const [createdRows, changeRows] = await Promise.all([
      prisma.tender.groupBy({
        by: ['createdById'],
        where: tenderWhere,
        _count: { _all: true },
      }),
      prisma.tenderStatusHistory.groupBy({
        by: ['changedById'],
        where: { ...dateWhere, ...(f.userId ? { changedById: f.userId } : {}) },
        _count: { _all: true },
      }),
    ]);
    const createdByUser = new Map(createdRows.map((r) => [r.createdById, r._count._all]));
    const changesByUser = new Map(changeRows.map((r) => [r.changedById, r._count._all]));

    const byUser = users.map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      tendersCreated: createdByUser.get(u.id) ?? 0,
      statusChanges: changesByUser.get(u.id) ?? 0,
    }));

    res.json({
      from: f.from ?? null,
      to: f.to ?? null,
      userId: f.userId ?? null,
      total,
      byStatus,
      wonLost,
      byUser,
    });
  } catch (err) {
    next(err);
  }
});
