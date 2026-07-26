import { z } from 'zod';

// M8+ — إعدادات النظام القابلة للتعديل (BR-009: أيام تنبيه اقتراب الإغلاق)
export const updateSettingsSchema = z.object({
  closingReminderDays: z.coerce
    .number({ invalid_type_error: 'يجب إدخال رقم' })
    .int('يجب أن يكون عددًا صحيحًا')
    .min(1, 'أقل قيمة يوم واحد')
    .max(60, 'أقصى قيمة 60 يومًا'),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export interface SystemSettings {
  closingReminderDays: number;
}
