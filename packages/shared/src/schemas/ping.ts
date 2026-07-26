import { z } from 'zod';

// Schema تجريبي للتحقق من مشاركة الحزمة بين api و web (M0.5)
export const pingSchema = z.object({
  message: z.string().min(1),
});

export type Ping = z.infer<typeof pingSchema>;
