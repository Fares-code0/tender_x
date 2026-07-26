import { Router } from 'express';
import { assignWriterSchema, managerDecisionSchema, tenderResultSchema } from '@tender/shared';
import { AppError, validate } from '../../lib/errors';
import * as tenderRepo from '../../repositories/tenderRepository';
import { runInTransaction } from '../../repositories/transaction';
import { recordStatusChange } from '../../lib/statusChange';
import { resolveTransition } from '../../services/tenderWorkflow';
import { decideAsManager } from '../../services/tenderDecision';
import { assignWriter } from '../../services/tenderAssignment';
import { notify, notifyRole } from '../../services/notifications';
import { requireRole } from '../../middleware/auth';

/** H6.2 — انتقالات سير العمل: التعيين، الإرسال للاعتماد، قرار المدير، التقديم، النتيجة. */
export const workflowRouter = Router();

// M4.2 — تعيين كاتب: UNDER_REVIEW → PROPOSAL_PREPARATION (QA) + BR-001 + BR-003
// H6.2 — قواعد BR-001/BR-003 في `services/tenderAssignment.ts`
workflowRouter.post('/:id/assign', requireRole('QA'), async (req, res, next) => {
  try {
    const input = validate(assignWriterSchema, req.body);
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);

    const updated = await assignWriter({
      tender,
      assigneeId: input.assigneeId,
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    res.json({ tender: updated });
  } catch (err) {
    next(err);
  }
});

// M4.3 — إرسال للاعتماد: PROPOSAL_PREPARATION → PENDING_APPROVAL (الكاتب المعيّن فقط)
workflowRouter.post('/:id/submit-for-approval', requireRole('WRITER'), async (req, res, next) => {
  try {
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    const to = resolveTransition('SUBMIT_FOR_APPROVAL', tender.status, req.user!.role);

    // الكاتب المعيّن فقط هو من يرسل للاعتماد
    if (tender.currentAssigneeId !== req.user!.id) {
      throw new AppError(403, 'NOT_ASSIGNEE', 'يمكن للكاتب المعيّن فقط إرسال العرض للاعتماد');
    }

    const updated = await runInTransaction((tx) =>
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
// H6.2 — المنطق في `services/tenderDecision.ts`؛ هنا التحقق والاستجابة فقط
workflowRouter.post('/:id/manager-decision', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const input = validate(managerDecisionSchema, req.body);
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    if (tender.status !== 'PENDING_APPROVAL') {
      throw new AppError(
        422,
        'INVALID_TRANSITION',
        'قرار المدير متاح فقط لمناقصة بانتظار الاعتماد',
      );
    }

    const result = await decideAsManager({
      tender,
      input,
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    res.json(result.approved ? { tender: result.tender, approved: true } : { tender: result.tender });
  } catch (err) {
    next(err);
  }
});

// M4.5 — تسجيل التقديم: PENDING_APPROVAL → SUBMITTED (Manager، بعد الاعتماد فقط — BR-004)
workflowRouter.post('/:id/mark-submitted', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    const to = resolveTransition('MARK_SUBMITTED', tender.status, req.user!.role);

    // BR-004: لا تقديم بدون اعتماد المدير
    if (!tender.managerApprovedAt) {
      throw new AppError(422, 'NOT_APPROVED', 'لا يمكن تسجيل التقديم قبل اعتماد المدير');
    }

    const updated = await runInTransaction((tx) =>
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
workflowRouter.post('/:id/result', requireRole('MANAGER'), async (req, res, next) => {
  try {
    const input = validate(tenderResultSchema, req.body);
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    const action = input.result === 'WON' ? 'RESULT_WON' : 'RESULT_LOST';
    const to = resolveTransition(action, tender.status, req.user!.role);

    const updated = await runInTransaction((tx) =>
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
