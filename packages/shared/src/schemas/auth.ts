import { z } from 'zod';

export const ROLES = ['ADMIN', 'QA', 'WRITER', 'MANAGER', 'OWNER'] as const;
export type RoleName = (typeof ROLES)[number];

export const roleSchema = z.enum(ROLES);

export const loginSchema = z.object({
  email: z.string({ required_error: 'البريد الإلكتروني مطلوب' }).email('بريد إلكتروني غير صالح'),
  // تسجيل الدخول لا يفرض قواعد التعقيد (لا يكسر حسابات قائمة) — فقط عدم الفراغ
  password: z.string({ required_error: 'كلمة المرور مطلوبة' }).min(1, 'كلمة المرور مطلوبة'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// H1.4 — سياسة كلمة مرور قوية: 10 أحرف على الأقل + حرف كبير + صغير + رقم
export const strongPasswordSchema = z
  .string({ required_error: 'كلمة المرور مطلوبة' })
  .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
  .regex(/[a-z]/, 'يجب أن تتضمن حرفًا لاتينيًا صغيرًا')
  .regex(/[A-Z]/, 'يجب أن تتضمن حرفًا لاتينيًا كبيرًا')
  .regex(/[0-9]/, 'يجب أن تتضمن رقمًا');

export const createUserSchema = z.object({
  name: z.string({ required_error: 'الاسم مطلوب' }).min(2, 'الاسم قصير جدًا'),
  email: z.string({ required_error: 'البريد الإلكتروني مطلوب' }).email('بريد إلكتروني غير صالح'),
  password: strongPasswordSchema,
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(2, 'الاسم قصير جدًا').optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: strongPasswordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا يوجد أي حقل للتعديل' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
