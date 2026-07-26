import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  createTenderSchema,
  updateTenderSchema,
  tenderListFiltersSchema,
  isTenderEditable,
} from '@tender/shared';
import { AppError, validate } from '../../lib/errors';
import * as tenderRepo from '../../repositories/tenderRepository';
import * as userRepo from '../../repositories/userRepository';
import { runInTransaction } from '../../repositories/transaction';
import { logAudit } from '../../lib/audit';
import { notifyRole } from '../../services/notifications';
import { requireRole } from '../../middleware/auth';

/** H6.2 — دورة حياة بيانات المناقصة: إنشاء، قائمة، تفاصيل، تعديل. */
export const crudRouter = Router();

// M2.2 + M2.5 — تسجيل مناقصة (QA فقط) مع تحذير التكرار القابل للتجاوز بـforce
crudRouter.post('/', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(createTenderSchema, req.body);
    const force = req.query.force === '1' || req.query.force === 'true';

    if (!force) {
      const duplicate = await tenderRepo.findDuplicate(input);
      if (duplicate) {
        throw new AppError(
          409,
          'DUPLICATE_TENDER',
          'توجد مناقصة مسجلة بنفس الرابط أو بنفس العنوان والجهة. أعد الإرسال مع التأكيد لتجاوز التحذير.',
          { duplicate },
        );
      }
    }

    const tender = await runInTransaction(async (tx) => {
      const created = await tenderRepo.createWithInitialStatus(
        tx,
        {
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
        req.user!.id,
      );
      await logAudit({
        tx,
        userId: req.user!.id,
        tenderId: created.id,
        action: 'TENDER_CREATED',
        details: { title: created.title, entity: created.entity, forced: force },
      });
      return created;
    });

    // M6.1 — إشعار فريق QA بوجود مناقصة جديدة للمراجعة (باستثناء المنشئ)
    await notifyRole({
      role: 'QA',
      type: 'TENDER_CREATED',
      tenderId: tender.id,
      message: `مناقصة جديدة بحاجة للمراجعة: ${tender.title}`,
      exceptUserId: req.user!.id,
    });

    res.status(201).json({ tender });
  } catch (err) {
    next(err);
  }
});

// M2.3 — قائمة المناقصات بفلاتر + pagination + ترتيب بموعد الإغلاق
crudRouter.get('/', async (req, res, next) => {
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

    const orderBy: Prisma.TenderOrderByWithRelationInput =
      filters.sort === 'closing_desc'
        ? { closingDate: 'desc' }
        : filters.sort === 'created_desc'
          ? { createdAt: 'desc' }
          : { closingDate: 'asc' };

    const [total, tenders] = await tenderRepo.listWithCount({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    });

    res.json({ tenders, total, page: filters.page, pageSize: filters.pageSize });
  } catch (err) {
    next(err);
  }
});

// M4.2 — قائمة الكتّاب النشطين للتعيين (لواجهة QA)
crudRouter.get('/meta/writers', async (_req, res, next) => {
  try {
    const writers = await userRepo.listWriters();
    res.json({ writers });
  } catch (err) {
    next(err);
  }
});

// M2.4 — تفاصيل المناقصة + المسؤول الحالي + تاريخ الحالات
crudRouter.get('/:id', async (req, res, next) => {
  try {
    const tender = await tenderRepo.findDetailByIdOrThrow(req.params.id);
    res.json({ tender });
  } catch (err) {
    next(err);
  }
});

// M2.4 — تعديل بيانات المناقصة (QA/Manager/Admin) + قيد Audit
crudRouter.patch('/:id', requireRole('QA', 'MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const input = validate(updateTenderSchema, req.body);
    const existing = await tenderRepo.findByIdOrThrow(req.params.id);
    // ACT-02: تُقفَل بيانات المناقصة بعد التقديم أو الإغلاق
    if (!isTenderEditable(existing.status)) {
      throw new AppError(422, 'TENDER_LOCKED', 'لا يمكن تعديل مناقصة بعد تقديمها أو إغلاقها');
    }

    const tender = await runInTransaction(async (tx) => {
      const updated = await tenderRepo.update(existing.id, input, tx);
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
