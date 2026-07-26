import { AppError } from '../lib/errors';
import * as checklistRepo from '../repositories/checklistRepository';

/** يجلب قالب الـChecklist النشط مع بنوده مرتبة (M3.4/M3.5) */
export function getActiveTemplate() {
  return checklistRepo.findActiveTemplate();
}

/**
 * BR-001: يتحقق من اكتمال كل بنود قالب المراجعة النشط لمناقصة.
 * يرمي 422 إن لم يوجد قالب نشط، ويعيد false إن كانت بنود ناقصة.
 *
 * H6.2 — أُخرج من ملف المسارات لأن قاعدة العمل هذه يستدعيها مساران مختلفان
 * (قرار المراجعة والتعيين)، فمكانها الطبيعي طبقة الخدمات.
 */
export async function isChecklistComplete(tenderId: string): Promise<boolean> {
  const template = await getActiveTemplate();
  if (!template || template.items.length === 0) {
    throw new AppError(422, 'NO_CHECKLIST', 'لا يوجد قالب مراجعة نشط');
  }
  const answers = await checklistRepo.listCheckedItemIds(tenderId);
  const checkedIds = new Set(answers.map((a) => a.itemId));
  return template.items.every((it) => checkedIds.has(it.id));
}
