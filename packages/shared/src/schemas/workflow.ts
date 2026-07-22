import { z } from 'zod';

// ── M4.2: تعيين كاتب ────────────────────────────────────────────
export const assignWriterSchema = z.object({
  assigneeId: z.string({ required_error: 'يجب اختيار كاتب' }).min(1, 'يجب اختيار كاتب'),
});
export type AssignWriterInput = z.infer<typeof assignWriterSchema>;

// ── M4.4: قرار المدير (اعتماد / إعادة بملاحظات / إيقاف) ──────────
export const managerDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({
    decision: z.literal('return'),
    // BR-011: إعادة العرض تتطلب ملاحظات إلزامية
    notes: z.string({ required_error: 'ملاحظات الإعادة مطلوبة' }).trim().min(3, 'ملاحظات الإعادة مطلوبة'),
  }),
  z.object({
    decision: z.literal('stop'),
    reason: z.string({ required_error: 'سبب الإيقاف مطلوب' }).trim().min(3, 'سبب الإيقاف مطلوب'),
  }),
]);
export type ManagerDecisionInput = z.infer<typeof managerDecisionSchema>;

// ── M4.5: تسجيل النتيجة (فوز / خسارة) — BR-005 ───────────────────
export const tenderResultSchema = z.object({
  result: z.enum(['WON', 'LOST'], { required_error: 'النتيجة مطلوبة' }),
});
export type TenderResultInput = z.infer<typeof tenderResultSchema>;
