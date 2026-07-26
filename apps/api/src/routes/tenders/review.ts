import { Router } from 'express';
import { saveChecklistAnswersSchema, reviewDecisionSchema } from '@tender/shared';
import { AppError, validate } from '../../lib/errors';
import * as tenderRepo from '../../repositories/tenderRepository';
import * as checklistRepo from '../../repositories/checklistRepository';
import { runInTransaction } from '../../repositories/transaction';
import { logAudit } from '../../lib/audit';
import { recordStatusChange } from '../../lib/statusChange';
import { resolveTransition } from '../../services/tenderWorkflow';
import { getActiveTemplate, isChecklistComplete } from '../../services/checklistCompletion';
import { requireRole } from '../../middleware/auth';

/** H6.2 — مرحلة المراجعة: بدؤها، بنود الـChecklist، وقرار المراجعة. */
export const reviewRouter = Router();

// M3.3 — بدء المراجعة: NEW → UNDER_REVIEW (QA فقط) + Audit + StatusHistory
reviewRouter.post('/:id/review/start', requireRole('QA'), async (req, res, next) => {
  try {
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    const to = resolveTransition('REVIEW_START', tender.status, req.user!.role);

    const updated = await runInTransaction((tx) =>
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
reviewRouter.get('/:id/checklist', async (req, res, next) => {
  try {
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);

    const template = await getActiveTemplate();
    const answers = await checklistRepo.listAnswers(tender.id);
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
reviewRouter.put('/:id/checklist', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(saveChecklistAnswersSchema, req.body);
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);

    // التأكد أن كل itemId يشير إلى بند فعلي (وإلا 422 بدل خطأ مفتاح أجنبي)
    const itemIds = input.answers.map((a) => a.itemId);
    const existingItems = await checklistRepo.findItemsByIds(itemIds);
    if (existingItems.length !== new Set(itemIds).size) {
      throw new AppError(422, 'INVALID_CHECKLIST_ITEM', 'أحد بنود الـChecklist غير موجود');
    }

    await runInTransaction(async (tx) => {
      for (const a of input.answers) {
        await checklistRepo.upsertAnswer(tx, {
          tenderId: tender.id,
          itemId: a.itemId,
          checked: a.checked,
          note: a.note,
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

    const answers = await checklistRepo.listAnswersOrdered(tender.id);
    res.json({ answers });
  } catch (err) {
    next(err);
  }
});

// M3.5 — قرار المراجعة: اعتماد (يتطلب اكتمال الـChecklist — BR-001) أو استبعاد (سبب إلزامي — BR-002)
reviewRouter.post('/:id/review/decision', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(reviewDecisionSchema, req.body);
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    if (tender.status !== 'UNDER_REVIEW') {
      throw new AppError(422, 'INVALID_TRANSITION', 'قرار المراجعة متاح فقط لمناقصة قيد المراجعة');
    }

    if (input.decision === 'reject') {
      const to = resolveTransition('REVIEW_REJECT', tender.status, req.user!.role);
      const updated = await runInTransaction((tx) =>
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
    const updated = await tenderRepo.findById(tender.id);
    res.json({ tender: updated, approved: true });
  } catch (err) {
    next(err);
  }
});
