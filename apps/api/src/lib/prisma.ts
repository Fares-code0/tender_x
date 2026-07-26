import './env';
import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

/**
 * H4.4 — ضبط تجمّع الاتصالات على رابط القاعدة.
 *
 * Prisma يقرأ `connection_limit` و`pool_timeout` من الـquery string. الافتراضي
 * (`num_cpus * 2 + 1`) يتجاوز غالبًا سعة PostgreSQL عند تشغيل عدة نسخ، فنجعله
 * صريحًا وقابلًا للضبط لكل نسخة.
 *
 * خلف **PgBouncer** بوضع transaction: مرّر `pgbouncer=true` في `DATABASE_URL`
 * (يعطّل الـprepared statements) واضبط `connection_limit=1` لكل نسخة، لأن
 * التجميع يصير مسؤولية PgBouncer لا Prisma.
 */
export function buildDatabaseUrl(
  raw: string = env.databaseUrl,
  limit: number | undefined = env.dbConnectionLimit,
  poolTimeout: number | undefined = env.dbPoolTimeout,
): string {
  if (limit === undefined && poolTimeout === undefined) return raw;
  try {
    const url = new URL(raw);
    // لا نكتب فوق قيمة ضبطها المشغّل صراحةً في الرابط
    if (limit !== undefined && !url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(limit));
    }
    if (poolTimeout !== undefined && !url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(poolTimeout));
    }
    return url.toString();
  } catch {
    // رابط غير قابل للتحليل — نتركه كما هو وتتكفّل رسالة خطأ Prisma بالتوضيح
    return raw;
  }
}

export const prisma = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
  // إصدار أحداث الاستعلامات (بلا طباعة) — يتيح رصد الاستعلامات البطيئة وقياس عددها
  log: [{ emit: 'event', level: 'query' }],
});

// H3.1/H4 — تسجيل الاستعلامات البطيئة فقط، حتى لا تُغرق السجلات
const SLOW_QUERY_MS = 500;
prisma.$on('query', (e) => {
  if (e.duration >= SLOW_QUERY_MS) {
    logger.warn({ durationMs: e.duration, query: e.query }, 'slow database query');
  }
});
