import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * H6.1 — تشغيل عمل ضمن معاملة واحدة بلا كشف عميل Prisma للمعالجات.
 *
 * المعالجات تحتاج المعاملة فعلًا (تغيير الحالة + قيد التدقيق يجب أن يقعا معًا
 * أو لا يقعا)، فنكشف الآلية لا العميل.
 */
export function runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

/** بنود قوالب المراجعة داخل معاملة (مصالحة القائمة) */
export const checklistItems = {
  deleteMissing(tx: Prisma.TransactionClient, templateId: string, keepIds: string[]) {
    return tx.checklistItem.deleteMany({
      where: { templateId, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
    });
  },
  update(tx: Prisma.TransactionClient, id: string, data: { text: string; order: number }) {
    return tx.checklistItem.update({ where: { id }, data });
  },
  create(tx: Prisma.TransactionClient, templateId: string, data: { text: string; order: number }) {
    return tx.checklistItem.create({ data: { templateId, ...data } });
  },
};

/** إجابات مراجعة المناقصة داخل معاملة */
export const checklistAnswers = {
  deleteForTender(tx: Prisma.TransactionClient, tenderId: string) {
    return tx.tenderChecklistAnswer.deleteMany({ where: { tenderId } });
  },
  createMany(tx: Prisma.TransactionClient, data: Prisma.TenderChecklistAnswerCreateManyInput[]) {
    return tx.tenderChecklistAnswer.createMany({ data });
  },
};
