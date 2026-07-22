import { z } from 'zod';

export const TENDER_STATUSES = [
  'NEW',
  'UNDER_REVIEW',
  'REJECTED',
  'PROPOSAL_PREPARATION',
  'PENDING_APPROVAL',
  'SUBMITTED',
  'WON',
  'LOST',
] as const;
export type TenderStatusName = (typeof TENDER_STATUSES)[number];

export const tenderStatusSchema = z.enum(TENDER_STATUSES);

// ACT-02: بيانات المناقصة تُقفَل بعد التقديم أو الإغلاق — لا تُعدَّل في هذه الحالات
export const LOCKED_TENDER_STATUSES: readonly TenderStatusName[] = [
  'SUBMITTED',
  'WON',
  'LOST',
  'REJECTED',
];
export function isTenderEditable(status: TenderStatusName): boolean {
  return !LOCKED_TENDER_STATUSES.includes(status);
}

// BR-010: العنوان والجهة المعلنة وموعد الإغلاق حقول إلزامية
export const createTenderSchema = z.object({
  title: z
    .string({ required_error: 'عنوان المناقصة مطلوب' })
    .trim()
    .min(3, 'عنوان المناقصة يجب أن يكون 3 أحرف على الأقل'),
  entity: z
    .string({ required_error: 'الجهة المعلنة مطلوبة' })
    .trim()
    .min(2, 'اسم الجهة المعلنة قصير جدًا'),
  closingDate: z.coerce.date({
    errorMap: () => ({ message: 'موعد الإغلاق مطلوب' }),
  }),
  source: z.string().trim().max(200, 'المصدر طويل جدًا').optional().or(z.literal('').transform(() => undefined)),
  url: z
    .string()
    .trim()
    .url('رابط غير صالح')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  description: z.string().trim().max(5000, 'الوصف طويل جدًا').optional().or(z.literal('').transform(() => undefined)),
});
export type CreateTenderInput = z.infer<typeof createTenderSchema>;

export const updateTenderSchema = z
  .object({
    title: z.string().trim().min(3, 'عنوان المناقصة يجب أن يكون 3 أحرف على الأقل').optional(),
    entity: z.string().trim().min(2, 'اسم الجهة المعلنة قصير جدًا').optional(),
    closingDate: z.coerce
      .date({ errorMap: () => ({ message: 'موعد الإغلاق غير صالح' }) })
      .optional(),
    source: z.string().trim().max(200).nullable().optional(),
    url: z.string().trim().url('رابط غير صالح').nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا يوجد أي حقل للتعديل' });
export type UpdateTenderInput = z.infer<typeof updateTenderSchema>;

export const tenderListFiltersSchema = z.object({
  status: tenderStatusSchema.optional(),
  entity: z.string().trim().min(1).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  closingBefore: z.coerce.date().optional(),
  closingAfter: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(['closing_asc', 'closing_desc', 'created_desc']).default('closing_asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TenderListFilters = z.infer<typeof tenderListFiltersSchema>;
export type TenderSort = TenderListFilters['sort'];
