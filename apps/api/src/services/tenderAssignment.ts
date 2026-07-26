import type { Role, Tender } from '@prisma/client';
import { AppError } from '../lib/errors';
import { recordStatusChange } from '../lib/statusChange';
import * as userRepo from '../repositories/userRepository';
import { runInTransaction } from '../repositories/transaction';
import { resolveTransition } from './tenderWorkflow';
import { isChecklistComplete } from './checklistCompletion';
import { notify } from './notifications';

/**
 * H6.2 — تعيين كاتب (M4.2) مع قاعدتي العمل المرتبطتين:
 * BR-001 (اكتمال الـChecklist قبل التعيين) و BR-003 (المسؤول كاتب نشط).
 */
export async function assignWriter(args: {
  tender: Tender;
  assigneeId: string;
  userId: string;
  userRole: Role;
}): Promise<Tender> {
  const { tender, assigneeId, userId, userRole } = args;
  const to = resolveTransition('ASSIGN_WRITER', tender.status, userRole);

  // BR-001: لا تحويل لإعداد العرض قبل اكتمال الـChecklist
  if (!(await isChecklistComplete(tender.id))) {
    throw new AppError(422, 'CHECKLIST_INCOMPLETE', 'يجب اكتمال الـChecklist قبل التعيين');
  }

  // BR-003: المسؤول الجديد يجب أن يكون كاتبًا نشطًا
  const writer = await userRepo.findById(assigneeId);
  if (!writer || !writer.isActive || writer.role !== 'WRITER') {
    throw new AppError(422, 'INVALID_ASSIGNEE', 'يجب تعيين كاتب عروض نشط');
  }

  const updated = await runInTransaction((tx) =>
    recordStatusChange(tx, {
      tenderId: tender.id,
      from: tender.status,
      to,
      userId,
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

  return updated;
}
