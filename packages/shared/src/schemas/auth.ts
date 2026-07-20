import { z } from 'zod';

export const ROLES = ['ADMIN', 'QA', 'WRITER', 'MANAGER', 'OWNER'] as const;
export type RoleName = (typeof ROLES)[number];

export const roleSchema = z.enum(ROLES);

export const loginSchema = z.object({
  email: z.string({ required_error: 'البريد الإلكتروني مطلوب' }).email('بريد إلكتروني غير صالح'),
  password: z.string({ required_error: 'كلمة المرور مطلوبة' }).min(1, 'كلمة المرور مطلوبة'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  name: z.string({ required_error: 'الاسم مطلوب' }).min(2, 'الاسم قصير جدًا'),
  email: z.string({ required_error: 'البريد الإلكتروني مطلوب' }).email('بريد إلكتروني غير صالح'),
  password: z
    .string({ required_error: 'كلمة المرور مطلوبة' })
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(2, 'الاسم قصير جدًا').optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا يوجد أي حقل للتعديل' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
