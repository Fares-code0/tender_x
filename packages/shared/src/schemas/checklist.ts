import { z } from 'zod';

// ── M3.1: قالب الـChecklist وبنوده ─────────────────────────────

// بند داخل قالب: وجود id = تعديل بند قائم، غيابه = بند جديد
export const checklistItemInputSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string({ required_error: 'نص البند مطلوب' }).trim().min(2, 'نص البند قصير جدًا'),
  order: z.coerce.number().int().min(0),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

export const createChecklistTemplateSchema = z.object({
  name: z.string({ required_error: 'اسم القالب مطلوب' }).trim().min(2, 'اسم القالب قصير جدًا'),
  items: z
    .array(checklistItemInputSchema.omit({ id: true }))
    .min(1, 'يجب إضافة بند واحد على الأقل'),
});
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;

export const updateChecklistTemplateSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم القالب قصير جدًا').optional(),
    isActive: z.boolean().optional(),
    // عند إرسال items تُستبدل بنود القالب بالكامل (upsert بالـid)
    items: z.array(checklistItemInputSchema).min(1, 'يجب إضافة بند واحد على الأقل').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا يوجد أي حقل للتعديل' });
export type UpdateChecklistTemplateInput = z.infer<typeof updateChecklistTemplateSchema>;

// ── M3.4: حفظ إجابات الـChecklist لمناقصة ──────────────────────

export const checklistAnswerInputSchema = z.object({
  itemId: z.string({ required_error: 'معرّف البند مطلوب' }).min(1),
  checked: z.boolean(),
  note: z
    .string()
    .trim()
    .max(1000, 'الملاحظة طويلة جدًا')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type ChecklistAnswerInput = z.infer<typeof checklistAnswerInputSchema>;

export const saveChecklistAnswersSchema = z.object({
  answers: z.array(checklistAnswerInputSchema).min(1, 'لا توجد إجابات للحفظ'),
});
export type SaveChecklistAnswersInput = z.infer<typeof saveChecklistAnswersSchema>;

// ── M3.5: قرار المراجعة (اعتماد / استبعاد) ─────────────────────

export const reviewDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({
    decision: z.literal('reject'),
    rejectionReason: z
      .string({ required_error: 'سبب الاستبعاد مطلوب' })
      .trim()
      .min(3, 'سبب الاستبعاد مطلوب'),
  }),
]);
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
