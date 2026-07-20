import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { createTenderSchema, updateTenderSchema, tenderListFiltersSchema } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError, validate } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

export const tendersRouter = Router();

tendersRouter.use(requireAuth);

const assigneeSelect = { select: { id: true, name: true, role: true } } as const;

// M2.2 + M2.5 — تسجيل مناقصة (QA فقط) مع تحذير التكرار القابل للتجاوز بـforce
tendersRouter.post('/', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(createTenderSchema, req.body);
    const force = req.query.force === '1' || req.query.force === 'true';

    if (!force) {
      const duplicate = await prisma.tender.findFirst({
        where: {
          OR: [
            ...(input.url ? [{ url: input.url }] : []),
            { AND: [{ title: input.title }, { entity: input.entity }] },
          ],
        },
        select: { id: true, title: true, entity: true, status: true },
      });
      if (duplicate) {
        throw new AppError(
          409,
          'DUPLICATE_TENDER',
          'توجد مناقصة مسجلة بنفس الرابط أو بنفس العنوان والجهة. أعد الإرسال مع التأكيد لتجاوز التحذير.',
          { duplicate },
        );
      }
    }

    const tender = await prisma.$transaction(async (tx) => {
      const created = await tx.tender.create({
        data: {
          title: input.title,
          entity: input.entity,
          closingDate: input.closingDate,
          source: input.source,
          url: input.url,
          description: input.description,
          status: 'NEW',
          createdById: req.user!.id,
          currentAssigneeId: req.user!.id,
        },
      });
      await tx.tenderStatusHistory.create({
        data: { tenderId: created.id, fromStatus: null, toStatus: 'NEW', changedById: req.user!.id },
      });
      await logAudit({
        tx,
        userId: req.user!.id,
        tenderId: created.id,
        action: 'TENDER_CREATED',
        details: { title: created.title, entity: created.entity, forced: force },
      });
      return created;
    });

    res.status(201).json({ tender });
  } catch (err) {
    next(err);
  }
});

// M2.3 — قائمة المناقصات بفلاتر + pagination + ترتيب بموعد الإغلاق
tendersRouter.get('/', async (req, res, next) => {
  try {
    const filters = validate(tenderListFiltersSchema, req.query);
    const where: Prisma.TenderWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.entity ? { entity: { contains: filters.entity, mode: 'insensitive' } } : {}),
      ...(filters.assigneeId ? { currentAssigneeId: filters.assigneeId } : {}),
      ...(filters.closingBefore || filters.closingAfter
        ? {
            closingDate: {
              ...(filters.closingBefore ? { lte: filters.closingBefore } : {}),
              ...(filters.closingAfter ? { gte: filters.closingAfter } : {}),
            },
          }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: 'insensitive' } },
              { entity: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, tenders] = await Promise.all([
      prisma.tender.count({ where }),
      prisma.tender.findMany({
        where,
        orderBy: { closingDate: 'asc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: { currentAssignee: assigneeSelect },
      }),
    ]);

    res.json({ tenders, total, page: filters.page, pageSize: filters.pageSize });
  } catch (err) {
    next(err);
  }
});

// M2.4 — تفاصيل المناقصة + المسؤول الحالي + تاريخ الحالات
tendersRouter.get('/:id', async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      include: {
        currentAssignee: assigneeSelect,
        createdBy: assigneeSelect,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { changedBy: assigneeSelect },
        },
      },
    });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    res.json({ tender });
  } catch (err) {
    next(err);
  }
});

// M2.4 — تعديل بيانات المناقصة (QA/Manager/Admin) + قيد Audit
tendersRouter.patch('/:id', requireRole('QA', 'MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const input = validate(updateTenderSchema, req.body);
    const existing = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');

    const tender = await prisma.$transaction(async (tx) => {
      const updated = await tx.tender.update({
        where: { id: existing.id },
        data: input,
        include: { currentAssignee: assigneeSelect },
      });
      await logAudit({
        tx,
        userId: req.user!.id,
        tenderId: existing.id,
        action: 'TENDER_UPDATED',
        details: { changes: Object.keys(input) },
      });
      return updated;
    });

    res.json({ tender });
  } catch (err) {
    next(err);
  }
});
