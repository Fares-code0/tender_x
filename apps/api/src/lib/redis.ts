import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * H2.1 — عميل Redis المشترك لتحديد المعدل الموزّع.
 *
 * إن لم يُضبط `REDIS_URL` نعمل بلا Redis (مخزن داخل الذاكرة) — مناسب لنسخة
 * واحدة وللتطوير المحلي؛ أمّا النشر الأفقي (أكثر من نسخة) فيتطلب ضبطه.
 */
export type RedisClient = Pick<
  Redis,
  'incr' | 'decr' | 'pexpire' | 'pttl' | 'del' | 'multi' | 'quit'
>;

let client: Redis | null = null;

/** يُنشئ (أو يعيد) عميل Redis المفرد، أو `null` إن لم يُضبط `REDIS_URL`. */
export function getRedisClient(): Redis | null {
  if (!env.redisUrl) return null;
  if (client) return client;

  client = new Redis(env.redisUrl, {
    // لا نُفشل الإقلاع بسبب Redis: نعيد المحاولة بتباعد متزايد
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: false,
  });

  client.on('error', (err: Error) => {
    logger.error({ err }, 'Redis connection error');
  });

  return client;
}

/** يغلق اتصال Redis (يُستدعى ضمن الإيقاف الرشيق — H0.3). */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // الاتصال مقطوع أصلًا — لا شيء لفعله
  } finally {
    client = null;
  }
}
