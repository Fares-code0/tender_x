import type { Role, TenderStatus } from '@prisma/client';
import { AppError } from '../lib/errors';

/**
 * M4.1 — State Machine مركزية لدورة حياة المناقصة.
 * جدول انتقالات واحد يعرّف (من حالة → إلى حالة → الأدوار المسموح لها) لكل إجراء.
 * كل تغيير حالة في النظام يجب أن يمر عبر `resolveTransition` حصريًا.
 *
 * نموذج الحالات (إلزامي):
 *   NEW → UNDER_REVIEW → (REJECTED | PROPOSAL_PREPARATION)
 *   PROPOSAL_PREPARATION → PENDING_APPROVAL
 *   PENDING_APPROVAL → (SUBMITTED | PROPOSAL_PREPARATION [إعادة بملاحظات] | REJECTED)
 *   SUBMITTED → (WON | LOST)
 */

export type WorkflowAction =
  | 'REVIEW_START' // بدء المراجعة (M3.3)
  | 'REVIEW_REJECT' // استبعاد أثناء المراجعة (M3.5)
  | 'ASSIGN_WRITER' // تعيين كاتب (M4.2)
  | 'SUBMIT_FOR_APPROVAL' // إرسال للاعتماد (M4.3)
  | 'MANAGER_RETURN' // إعادة للكاتب بملاحظات (M4.4)
  | 'MANAGER_STOP' // إيقاف/استبعاد من المدير (M4.4)
  | 'MARK_SUBMITTED' // تسجيل التقديم (M4.5)
  | 'RESULT_WON' // تسجيل نتيجة فوز (M4.5)
  | 'RESULT_LOST'; // تسجيل نتيجة خسارة (M4.5)

export interface TransitionRule {
  action: WorkflowAction;
  from: TenderStatus;
  to: TenderStatus;
  roles: Role[];
}

/** جدول الانتقالات — المصدر الوحيد لقواعد تغيير الحالة */
export const TRANSITIONS: readonly TransitionRule[] = [
  { action: 'REVIEW_START', from: 'NEW', to: 'UNDER_REVIEW', roles: ['QA'] },
  { action: 'REVIEW_REJECT', from: 'UNDER_REVIEW', to: 'REJECTED', roles: ['QA'] },
  { action: 'ASSIGN_WRITER', from: 'UNDER_REVIEW', to: 'PROPOSAL_PREPARATION', roles: ['QA'] },
  {
    action: 'SUBMIT_FOR_APPROVAL',
    from: 'PROPOSAL_PREPARATION',
    to: 'PENDING_APPROVAL',
    roles: ['WRITER'],
  },
  {
    action: 'MANAGER_RETURN',
    from: 'PENDING_APPROVAL',
    to: 'PROPOSAL_PREPARATION',
    roles: ['MANAGER'],
  },
  { action: 'MANAGER_STOP', from: 'PENDING_APPROVAL', to: 'REJECTED', roles: ['MANAGER'] },
  { action: 'MARK_SUBMITTED', from: 'PENDING_APPROVAL', to: 'SUBMITTED', roles: ['MANAGER'] },
  { action: 'RESULT_WON', from: 'SUBMITTED', to: 'WON', roles: ['MANAGER'] },
  { action: 'RESULT_LOST', from: 'SUBMITTED', to: 'LOST', roles: ['MANAGER'] },
] as const;

/**
 * يتحقق من صحة الانتقال ويعيد الحالة الهدف.
 * يرمي AppError(422) عند قفز الحالات أو إجراء غير معرّف من الحالة الحالية،
 * وAppError(403) عند دور غير مسموح له بهذا الانتقال.
 */
export function resolveTransition(
  action: WorkflowAction,
  from: TenderStatus,
  role: Role,
): TenderStatus {
  const rule = TRANSITIONS.find((r) => r.action === action && r.from === from);
  if (!rule) {
    throw new AppError(
      422,
      'INVALID_TRANSITION',
      `لا يمكن تنفيذ هذا الإجراء على مناقصة في الحالة الحالية`,
    );
  }
  if (!rule.roles.includes(role)) {
    throw new AppError(403, 'FORBIDDEN_TRANSITION', 'ليست لديك صلاحية لهذا الانتقال');
  }
  return rule.to;
}

/** هل يوجد انتقال معرّف لهذا الإجراء من هذه الحالة (بغضّ النظر عن الدور)؟ */
export function canTransition(action: WorkflowAction, from: TenderStatus): boolean {
  return TRANSITIONS.some((r) => r.action === action && r.from === from);
}
