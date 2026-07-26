import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { Db } from './tenderRepository';

/** H6.1 — وصول Prisma الخاص بقوالب المراجعة وإجاباتها. */

export const templateInclude = {
  items: { orderBy: { order: 'asc' } },
} satisfies Prisma.ChecklistTemplateInclude;

/** M3.4/M3.5 — القالب النشط مع بنوده مرتّبة */
export function findActiveTemplate() {
  return prisma.checklistTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: templateInclude,
  });
}

export function listTemplates() {
  return prisma.checklistTemplate.findMany({
    include: templateInclude,
    orderBy: { createdAt: 'asc' },
  });
}

export function findTemplateWithItems(id: string) {
  return prisma.checklistTemplate.findUnique({ where: { id }, include: { items: true } });
}

export function createTemplate(data: Prisma.ChecklistTemplateCreateInput, db: Db = prisma) {
  return db.checklistTemplate.create({ data, include: templateInclude });
}

export function updateTemplate(id: string, data: Prisma.ChecklistTemplateUpdateInput, db: Db = prisma) {
  return db.checklistTemplate.update({ where: { id }, data });
}

export function findTemplateById(id: string, db: Db = prisma) {
  return db.checklistTemplate.findUnique({ where: { id }, include: templateInclude });
}

/** معرّفات بنود قالب (للتحقق من انتماء الإجابات إليه) */
export function listItemIds(templateId: string) {
  return prisma.checklistItem.findMany({ where: { templateId }, select: { id: true } });
}

/** إجابات المراجعة لمناقصة */
export function listAnswers(tenderId: string) {
  return prisma.tenderChecklistAnswer.findMany({ where: { tenderId } });
}

/** M3.5 — حفظ إجابة بند (إنشاء أو تحديث) داخل معاملة */
export function upsertAnswer(
  tx: Prisma.TransactionClient,
  args: { tenderId: string; itemId: string; checked: boolean; note?: string | null },
) {
  return tx.tenderChecklistAnswer.upsert({
    where: { tenderId_itemId: { tenderId: args.tenderId, itemId: args.itemId } },
    create: {
      tenderId: args.tenderId,
      itemId: args.itemId,
      checked: args.checked,
      note: args.note,
    },
    update: { checked: args.checked, note: args.note ?? null },
  });
}

/** إجابات المراجعة مرتّبة بترتيب البنود (شكل استجابة الواجهة) */
export function listAnswersOrdered(tenderId: string) {
  return prisma.tenderChecklistAnswer.findMany({
    where: { tenderId },
    orderBy: { item: { order: 'asc' } },
  });
}

/** التحقق من وجود البنود المشار إليها في الإجابات */
export function findItemsByIds(ids: string[]) {
  return prisma.checklistItem.findMany({ where: { id: { in: ids } }, select: { id: true } });
}

/** معرّفات البنود المؤشَّرة فقط (BR-001) */
export function listCheckedItemIds(tenderId: string) {
  return prisma.tenderChecklistAnswer.findMany({
    where: { tenderId, checked: true },
    select: { itemId: true },
  });
}
