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
  // H2.1 — عند ضبطه يصبح تحديد المعدل موزّعًا عبر كل النسخ؛ بدونه مخزن في الذاكرة
  REDIS_URL: z.string().min(1).optional(),
  // H2.2 — الحد العام لكل IP في النافذة
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // H2.3 — قفل الحساب بعد محاولات دخول فاشلة متتالية
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  // H3.1 — مستوى التسجيل (silent في الاختبارات حتى لا تُغرق المخرجات)
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  // H4.4 — تجمّع اتصالات Prisma (يُضاف إلى DATABASE_URL). خلف PgBouncer اضبط 1.
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().optional(),
  DB_POOL_TIMEOUT: z.coerce.number().int().nonnegative().optional(),
  // H5.1 — تخزين كائني على S3. عند ضبط S3_BUCKET يُستخدم S3 بدل القرص المحلي.
  // الاعتماديات تأتي من سلسلة AWS الافتراضية (دور IAM / متغيرات AWS_*) — لا مفاتيح هنا.
  S3_BUCKET: z.string().min(1).optional(),
  S3_PREFIX: z.string().optional(),
  AWS_REGION: z.string().min(1).optional(),
  // H5.3 — مدة صلاحية الكاش للقراءات الساخنة (ثوانٍ)
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
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
  redisUrl?: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  loginMaxFailedAttempts: number;
  loginLockMinutes: number;
  logLevel: string;
  dbConnectionLimit?: number;
  dbPoolTimeout?: number;
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  cacheTtlSeconds: number;
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
    redisUrl: v.REDIS_URL,
    rateLimitWindowMs: v.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: v.RATE_LIMIT_MAX,
    loginMaxFailedAttempts: v.LOGIN_MAX_FAILED_ATTEMPTS,
    loginLockMinutes: v.LOGIN_LOCK_MINUTES,
    logLevel: v.LOG_LEVEL ?? (v.NODE_ENV === 'test' ? 'silent' : 'info'),
    dbConnectionLimit: v.DB_CONNECTION_LIMIT,
    dbPoolTimeout: v.DB_POOL_TIMEOUT,
    s3Bucket: v.S3_BUCKET,
    s3Prefix: v.S3_PREFIX,
    awsRegion: v.AWS_REGION,
    cacheTtlSeconds: v.CACHE_TTL_SECONDS,
  };
}

export const env = parseEnv();
