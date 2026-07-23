import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// تحميل .env من جذر apps/api (Node 20+ يوفر loadEnvFile بدون مكتبات)
// في الاختبارات (VITEST) لا نحمّل .env حتى لا نكتب فوق DATABASE_URL الخاص بقاعدة الاختبار
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (!process.env.VITEST && fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // المتغيرات معرفة مسبقًا (مثلًا في الاختبارات) — نتجاهل
  }
}

// H0.1 — أسرار افتراضية/ضعيفة ممنوعة في الإنتاج
const WEAK_JWT_SECRETS = new Set([
  'dev-secret-do-not-use-in-production',
  'change-me-in-production',
  'secret',
  'changeme',
  'test-secret',
]);

const MIN_PROD_SECRET_LENGTH = 16;

const envSchema = z.object({
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL مطلوب' }).min(1, 'DATABASE_URL مطلوب'),
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET مطلوب' }).min(1, 'JWT_SECRET مطلوب'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url('WEB_ORIGIN يجب أن يكون رابطًا صالحًا').default('http://localhost:5173'),
  // عدد قفزات البروكسي الموثوق (H0.2) — 0 يعني لا بروكسي
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  UPLOADS_DIR: z.string().optional(),
});

export interface Env {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  webOrigin: string;
  trustProxyHops: number;
  uploadsDir?: string;
}

/**
 * H0.1 — تحقق بيئة صارم بـZod عند الإقلاع. يرمي خطأً فادحًا واضحًا إن غاب
 * `JWT_SECRET`/`DATABASE_URL`، وفي الإنتاج يرفض السرّ الافتراضي/الضعيف أو القصير.
 * قابل للاستدعاء بمصدر مُحقَن لتسهيل الاختبار.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('؛ ');
    throw new Error(`إعدادات البيئة غير صالحة — ${issues}`);
  }
  const v = parsed.data;

  if (v.NODE_ENV === 'production') {
    if (WEAK_JWT_SECRETS.has(v.JWT_SECRET) || v.JWT_SECRET.length < MIN_PROD_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET ضعيف أو افتراضي في الإنتاج — استخدم سرًّا عشوائيًا لا يقل عن ${MIN_PROD_SECRET_LENGTH} حرفًا`,
      );
    }
  }

  return {
    databaseUrl: v.DATABASE_URL,
    jwtSecret: v.JWT_SECRET,
    jwtExpiresIn: v.JWT_EXPIRES_IN,
    nodeEnv: v.NODE_ENV,
    port: v.PORT,
    webOrigin: v.WEB_ORIGIN,
    trustProxyHops: v.TRUST_PROXY,
    uploadsDir: v.UPLOADS_DIR,
  };
}

export const env = parseEnv();
