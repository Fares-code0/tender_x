import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  createTenderSchema,
  updateTenderSchema,
  tenderListFiltersSchema,
  saveChecklistAnswersSchema,
  reviewDecisionSchema,
  assignWriterSchema,
  managerDecisionSchema,
  tenderResultSchema,
  isTenderEditable,
} from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError, validate } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { recordStatusChange } from '../lib/statusChange';
import { resolveTransition } from '../services/tenderWorkflow';
import { notify, notifyRole } from '../services/notifications';
import { storage } from '../services/storage';
import { upload, mapUploadError } from './attachments';
import { requireAuth, requireRole } from '../middleware/auth';

/** يجلب قالب الـChecklist النشط مع بنوده مرتبة (M3.4/M3.5) */
async function getActiveTemplate() {
  return prisma.checklistTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { order: 'asc' } } },
  });
}

/**
 * BR-001: يتحقق من اكتمال كل بنود قالب المراجعة النشط لمناقصة.
 * يرمي 422 إن لم يوجد قالب نشط، ويعيد false إن كانت بنود ناقصة.
 */
async function isChecklistComplete(tenderId: string): Promise<boolean> {
  const template = await getActiveTemplate();
  if (!template || template.items.length === 0) {
    throw new AppError(422, 'NO_CHECKLIST', 'لا يوجد قالب مراجعة نشط');
  }
  const answers = await prisma.tenderChecklistAnswer.findMany({
    where: { tenderId, checked: true },
    select: { itemId: true },
  });
  const checkedIds = new Set(answers.map((a) => a.itemId));
  return template.items.every((it) => checkedIds.has(it.id));
}

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

    const orderBy: Prisma.TenderOrderByWithRelationInput =
      filters.sort === 'closing_desc'
        ? { closingDate: 'desc' }
        : filters.sort === 'created_desc'
          ? { createdAt: 'desc' }
          : { closingDate: 'asc' };

    const [total, tenders] = await Promise.all([
      prisma.tender.count({ where }),
      prisma.tender.findMany({
        where,
        orderBy,
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

// M4.2 — قائمة الكتّاب النشطين للتعيين (لواجهة QA)
tendersRouter.get('/meta/writers', async (_req, res, next) => {
  try {
    const writers = await prisma.user.findMany({
      where: { role: 'WRITER', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ writers });
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
    // ACT-02: تُقفَل بيانات المناقصة بعد التقديم أو الإغلاق
    if (!isTenderEditable(existing.status)) {
      throw new AppError(422, 'TENDER_LOCKED', 'لا يمكن تعديل مناقصة بعد تقديمها أو إغلاقها');
    }

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

// M3.3 — بدء المراجعة: NEW → UNDER_REVIEW (QA فقط) + Audit + StatusHistory
tendersRouter.post('/:id/review/start', requireRole('QA'), async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const to = resolveTransition('REVIEW_START', tender.status, req.user!.role);

    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'REVIEW_STARTED',
        extraData: { currentAssigneeId: req.user!.id },
      }),
    );

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M3.4 — استرجاع بنود قالب المراجعة النشط مع إجابات المناقصة المحفوظة
tendersRouter.get('/:id/checklist', async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');

    const template = await getActiveTemplate();
    const answers = await prisma.tenderChecklistAnswer.findMany({
      where: { tenderId: tender.id },
    });
    const answerByItem = new Map(answers.map((a) => [a.itemId, a]));

    const items = (template?.items ?? []).map((it) => ({
      itemId: it.id,
      text: it.text,
      order: it.order,
      checked: answerByItem.get(it.id)?.checked ?? false,
      note: answerByItem.get(it.id)?.note ?? null,
    }));

    res.json({ templateId: template?.id ?? null, items });
  } catch (err) {
    next(err);
  }
});

// M3.4 — حفظ إجابات الـChecklist (QA فقط): checked + ملاحظة اختيارية لكل بند
tendersRouter.put('/:id/checklist', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(saveChecklistAnswersSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');

    // التأكد أن كل itemId يشير إلى بند فعلي (وإلا 422 بدل خطأ مفتاح أجنبي)
    const itemIds = input.answers.map((a) => a.itemId);
    const existingItems = await prisma.checklistItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true },
    });
    if (existingItems.length !== new Set(itemIds).size) {
      throw new AppError(422, 'INVALID_CHECKLIST_ITEM', 'أحد بنود الـChecklist غير موجود');
    }

    await prisma.$transaction(async (tx) => {
      for (const a of input.answers) {
        await tx.tenderChecklistAnswer.upsert({
          where: { tenderId_itemId: { tenderId: tender.id, itemId: a.itemId } },
          create: { tenderId: tender.id, itemId: a.itemId, checked: a.checked, note: a.note },
          update: { checked: a.checked, note: a.note ?? null },
        });
      }
      await logAudit({
        tx,
        userId: req.user!.id,
        tenderId: tender.id,
        action: 'CHECKLIST_SAVED',
        details: { count: input.answers.length },
      });
    });

    const answers = await prisma.tenderChecklistAnswer.findMany({
      where: { tenderId: tender.id },
      orderBy: { item: { order: 'asc' } },
    });
    res.json({ answers });
  } catch (err) {
    next(err);
  }
});

// M3.5 — قرار المراجعة: اعتماد (يتطلب اكتمال الـChecklist — BR-001) أو استبعاد (سبب إلزامي — BR-002)
tendersRouter.post('/:id/review/decision', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(reviewDecisionSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    if (tender.status !== 'UNDER_REVIEW') {
      throw new AppError(422, 'INVALID_TRANSITION', 'قرار المراجعة متاح فقط لمناقصة قيد المراجعة');
    }

    if (input.decision === 'reject') {
      const to = resolveTransition('REVIEW_REJECT', tender.status, req.user!.role);
      const updated = await prisma.$transaction((tx) =>
        recordStatusChange(tx, {
          tenderId: tender.id,
          from: tender.status,
          to,
          userId: req.user!.id,
          action: 'REVIEW_REJECTED',
          note: input.rejectionReason,
          details: { rejectionReason: input.rejectionReason },
          extraData: { rejectionReason: input.rejectionReason, currentAssigneeId: null },
        }),
      );
      return res.json({ tender: updated });
    }

    // approve — BR-001: كل بنود قالب المراجعة النشط يجب أن تكون مؤشَّرة
    if (!(await isChecklistComplete(tender.id))) {
      throw new AppError(
        422,
        'CHECKLIST_INCOMPLETE',
        'يجب اكتمال جميع بنود الـChecklist قبل الاعتماد',
      );
    }

    // الحالة تبقى UNDER_REVIEW (جاهزة للتعيين في M4) — نسجّل قيد اعتماد فقط
    await logAudit({
      userId: req.user!.id,
      tenderId: tender.id,
      action: 'REVIEW_APPROVED',
      details: {},
    });
    const updated = await prisma.tender.findUnique({ where: { id: tender.id } });
    res.json({ tender: updated, approved: true });
  } catch (err) {
    next(err);
  }
});

// M4.2 — تعيين كاتب: UNDER_REVIEW → PROPOSAL_PREPARATION (QA) + BR-001 + BR-003
tendersRouter.post('/:id/assign', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(assignWriterSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const to = resolveTransition('ASSIGN_WRITER', tender.status, req.user!.role);

    // BR-001: لا تحويل لإعداد العرض قبل اكتمال الـChecklist
    if (!(await isChecklistComplete(tender.id))) {
      throw new AppError(422, 'CHECKLIST_INCOMPLETE', 'يجب اكتمال الـChecklist قبل التعيين');
    }

    // المسؤول الجديد يجب أن يكون كاتبًا نشطًا (BR-003)
    const writer = await prisma.user.findUnique({ where: { id: input.assigneeId } });
    if (!writer || !writer.isActive || writer.role !== 'WRITER') {
      throw new AppError(422, 'INVALID_ASSIGNEE', 'يجب تعيين كاتب عروض نشط');
    }

    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'ASSIGNED',
        details: { assigneeId: writer.id, assigneeName: writer.name },
        extraData: { currentAssigneeId: writer.id },
      }),
    );

    // M6.1 — إشعار الكاتب المعيّن تحديدًا
    await notify({
      userId: writer.id,
      type: 'ASSIGNED',
      tenderId: tender.id,
      message: `عُيّنت لك مناقصة لإعداد العرض: ${tender.title}`,
    });

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M4.3 — إرسال للاعتماد: PROPOSAL_PREPARATION → PENDING_APPROVAL (الكاتب المعيّن فقط)
tendersRouter.post('/:id/submit-for-approval', requireRole('WRITER'), async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const to = resolveTransition('SUBMIT_FOR_APPROVAL', tender.status, req.user!.role);

    // الكاتب المعيّن فقط هو من يرسل للاعتماد
    if (tender.currentAssigneeId !== req.user!.id) {
      throw new AppError(403, 'NOT_ASSIGNEE', 'يمكن للكاتب المعيّن فقط إرسال العرض للاعتماد');
    }

    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'SUBMITTED_FOR_APPROVAL',
        // يصبح بانتظار المدير (مجمّع المدراء) — يُعرَض في مهام المدير بالحالة
        extraData: { currentAssigneeId: null, managerApprovedAt: null },
      }),
    );

    // M6.1 — إشعار المدراء بوجود عرض بانتظار الاعتماد
    await notifyRole({
      role: 'MANAGER',
      type: 'SUBMITTED_FOR_APPROVAL',
      tenderId: tender.id,
      message: `عرض بانتظار اعتمادك: ${tender.title}`,
    });

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M4.4 — قرار المدير: اعتماد / إعادة بملاحظات (BR-011) / إيقاف
tendersRouter.post('/:id/manager-decision', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const input = validate(managerDecisionSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    if (tender.status !== 'PENDING_APPROVAL') {
      throw new AppError(422, 'INVALID_TRANSITION', 'قرار المدير متاح فقط لمناقصة بانتظار الاعتماد');
    }

    // اعتماد: لا يغيّر الحالة — يضبط managerApprovedAt استعدادًا للتقديم (BR-004)
    if (input.decision === 'approve') {
      const updated = await prisma.$transaction(async (tx) => {
        const t = await tx.tender.update({
          where: { id: tender.id },
          data: { managerApprovedAt: new Date(), currentAssigneeId: req.user!.id },
        });
        await logAudit({ tx, userId: req.user!.id, tenderId: tender.id, action: 'MANAGER_APPROVED' });
        return t;
      });
      // M6.1 — إشعار الكاتب المُرسِل باعتماد عرضه
      const submitEvent = await prisma.tenderStatusHistory.findFirst({
        where: { tenderId: tender.id, toStatus: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
      });
      if (submitEvent?.changedById) {
        await notify({
          userId: submitEvent.changedById,
          type: 'APPROVED',
          tenderId: tender.id,
          message: `اعتُمد عرضك: ${tender.title}`,
        });
      }
      return res.json({ tender: updated, approved: true });
    }

    // إعادة: PENDING_APPROVAL → PROPOSAL_PREPARATION للكاتب نفسه (BR-011)
    if (input.decision === 'return') {
      const to = resolveTransition('MANAGER_RETURN', tender.status, req.user!.role);
      // الكاتب نفسه = من أرسل للاعتماد آخر مرة
      const lastSubmit = await prisma.tenderStatusHistory.findFirst({
        where: { tenderId: tender.id, toStatus: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
      });
      const updated = await prisma.$transaction((tx) =>
        recordStatusChange(tx, {
          tenderId: tender.id,
          from: tender.status,
          to,
          userId: req.user!.id,
          action: 'MANAGER_RETURNED',
          note: input.notes,
          details: { notes: input.notes },
          extraData: { currentAssigneeId: lastSubmit?.changedById ?? null, managerApprovedAt: null },
        }),
      );
      // M6.1 — إشعار الكاتب بإعادة العرض إليه مع الملاحظات
      if (lastSubmit?.changedById) {
        await notify({
          userId: lastSubmit.changedById,
          type: 'RETURNED',
          tenderId: tender.id,
          message: `أُعيدت إليك المناقصة مع ملاحظات: ${tender.title}`,
        });
      }
      return res.json({ tender: updated });
    }

    // إيقاف: PENDING_APPROVAL → REJECTED (سبب إلزامي)
    const to = resolveTransition('MANAGER_STOP', tender.status, req.user!.role);
    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'MANAGER_STOPPED',
        note: input.reason,
        details: { reason: input.reason },
        extraData: { rejectionReason: input.reason, currentAssigneeId: null, managerApprovedAt: null },
      }),
    );
    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M4.5 — تسجيل التقديم: PENDING_APPROVAL → SUBMITTED (Manager، بعد الاعتماد فقط — BR-004)
tendersRouter.post('/:id/mark-submitted', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const to = resolveTransition('MARK_SUBMITTED', tender.status, req.user!.role);

    // BR-004: لا تقديم بدون اعتماد المدير
    if (!tender.managerApprovedAt) {
      throw new AppError(422, 'NOT_APPROVED', 'لا يمكن تسجيل التقديم قبل اعتماد المدير');
    }

    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'MARKED_SUBMITTED',
        extraData: { currentAssigneeId: req.user!.id },
      }),
    );

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M4.5 — تسجيل النتيجة: SUBMITTED → WON | LOST (BR-005)
tendersRouter.post('/:id/result', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const input = validate(tenderResultSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const action = input.result === 'WON' ? 'RESULT_WON' : 'RESULT_LOST';
    const to = resolveTransition(action, tender.status, req.user!.role);

    const updated = await prisma.$transaction((tx) =>
      recordStatusChange(tx, {
        tenderId: tender.id,
        from: tender.status,
        to,
        userId: req.user!.id,
        action: 'RESULT_RECORDED',
        details: { result: input.result },
      }),
    );

    // M6.1 — إشعار منشئ المناقصة بالنتيجة
    await notify({
      userId: tender.createdById,
      type: 'RESULT',
      tenderId: tender.id,
      message: `نتيجة المناقصة ${tender.title}: ${input.result === 'WON' ? 'فوز' : 'خسارة'}`,
    });

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

const attachmentUploaderSelect = { select: { id: true, name: true } } as const;

// M5.1 + M5.3 — رفع مرفق (WRITER) خلف StorageService + قيود النوع/الحجم + versioning
tendersRouter.post('/:id/attachments', requireRole('WRITER'), (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) throw mapUploadError(err);
      if (!req.file) throw new AppError(422, 'NO_FILE', 'لم يُرفَق أي ملف');

      const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
      if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');

      // multer يفك ترميز اسم الملف كـlatin1؛ نعيد تفسيره UTF-8 لدعم الأسماء العربية
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      // M5.3 — إعادة رفع نفس الاسم تنشئ نسخة جديدة مع بقاء القديمة
      const prior = await prisma.attachment.count({ where: { tenderId: tender.id, fileName } });
      const version = prior + 1;
      const key = `${tender.id}/${crypto.randomUUID()}${path.extname(fileName)}`;
      await storage.save(key, req.file.buffer);

      const attachment = await prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            tenderId: tender.id,
            fileName,
            storagePath: key,
            mimeType: req.file!.mimetype,
            size: req.file!.size,
            version,
            uploadedById: req.user!.id,
          },
          include: { uploadedBy: attachmentUploaderSelect },
        });
        await logAudit({
          tx,
          userId: req.user!.id,
          tenderId: tender.id,
          action: 'ATTACHMENT_UPLOADED',
          details: { attachmentId: created.id, fileName, version, size: created.size },
        });
        return created;
      });

      res.status(201).json({ attachment });
    } catch (e) {
      next(e);
    }
  });
});

// M8.1 — سجل عمليات المناقصة (Manager/Owner/Admin) — قراءة فقط، لا حذف/تعديل (NFR-005)
tendersRouter.get(
  '/:id/audit',
  requireRole('MANAGER', 'OWNER', 'ADMIN'),
  async (req, res, next) => {
    try {
      const tender = await prisma.tender.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
      const entries = await prisma.auditLog.findMany({
        where: { tenderId: tender.id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  },
);

// M5.2 — قائمة مرفقات المناقصة (الاسم، الرافع، التاريخ، الحجم، الإصدار)
tendersRouter.get('/:id/attachments', async (req, res, next) => {
  try {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
    const attachments = await prisma.attachment.findMany({
      where: { tenderId: tender.id },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: attachmentUploaderSelect },
    });
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
});
