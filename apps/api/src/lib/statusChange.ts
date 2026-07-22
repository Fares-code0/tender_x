import type { Prisma, TenderStatus } from '@prisma/client';
import { logAudit } from './audit';

/**
 * ينفّذ تغيير حالة مناقصة داخل معاملة: يحدّث الحالة + يسجّل صفًا في
 * TenderStatusHistory + قيد Audit (BR-008). كل تغييرات الحالة تمر من هنا،
 * وستغلّفه State Machine المركزية في M4.
 */
export async function recordStatusChange(
  tx: Prisma.TransactionClient,
  params: {
    tenderId: string;
    from: TenderStatus;
    to: TenderStatus;
    userId: string;
    action: string;
    note?: string;
    details?: Prisma.InputJsonValue;
    extraData?: Prisma.TenderUncheckedUpdateInput;
  },
) {
  const updated = await tx.tender.update({
    where: { id: params.tenderId },
    data: { status: params.to, ...params.extraData },
  });
  await tx.tenderStatusHistory.create({
    data: {
      tenderId: params.tenderId,
      fromStatus: params.from,
      toStatus: params.to,
      changedById: params.userId,
      note: params.note,
    },
  });
  await logAudit({
    tx,
    userId: params.userId,
    tenderId: params.tenderId,
    action: params.action,
    details: params.details,
  });
  return updated;
}
