import { env } from './env';
import { logger } from './logger';

/** الحد الأدنى من واجهة Redis اللازمة للكاش. */
export interface CacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', ttlSeconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

/**
 * H5.3 — كاش قراءات ساخنة على Redis.
 *
 * يعيد القيمة من الكاش إن وُجدت، وإلا ينفّذ `fn` ويخزّن نتيجتها.
 * عند غياب Redis أو أي خطأ فيه نعود إلى المصدر مباشرةً — الكاش تحسين لا اعتماد:
 * تعطّل Redis يبطئ الطلب ولا يُسقط الميزة.
 */
export async function cached<T>(
  redis: CacheRedis | null,
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = env.cacheTtlSeconds,
): Promise<T> {
  if (!redis) return fn();

  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, 'cache read failed, falling back to source');
    return fn();
  }

  const value = await fn();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed');
  }
  return value;
}

/** يُبطل مفاتيح الكاش المحدّدة (بعد كتابة تُغيّر القراءات الساخنة). */
export async function invalidate(redis: CacheRedis | null, ...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, 'cache invalidation failed');
  }
}

export const CACHE_KEYS = {
  /** إحصائيات لوحة المعلومات الشاملة (تجميع مكلف يتغيّر ببطء) */
  aggregateStats: 'cache:stats:aggregate',
} as const;
