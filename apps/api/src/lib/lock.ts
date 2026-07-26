import crypto from 'node:crypto';
import { logger } from './logger';

/** الحد الأدنى من واجهة Redis اللازمة للقفل. */
export interface LockRedis {
  set(
    key: string,
    value: string,
    px: 'PX',
    ttlMs: number,
    nx: 'NX',
  ): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

/**
 * سكربت التحرير: يحذف المفتاح **فقط** إن كان لا يزال يحمل رمزنا.
 * بدونه قد تحذف نسخةٌ قفلًا انتهت مهلته واستحوذت عليه نسخة أخرى.
 */
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

export const LOCK_KEYS = {
  /** مهمة تنبيه اقتراب موعد الإغلاق (M6.2) */
  closingReminder: 'lock:cron:closing-reminder',
} as const;

export interface WithLockOptions {
  /** مدة صلاحية القفل — يجب أن تتجاوز أطول زمن متوقّع للمهمة */
  ttlMs?: number;
}

/**
 * H5.2 — قفل موزّع لتشغيل المهام الدورية مرة واحدة فقط مهما تعدّدت النسخ.
 *
 * ينفّذ `fn` فقط إن نجح في الاستحواذ على القفل، ويعيد `null` إن كانت نسخة أخرى
 * تعمل عليه. عند غياب Redis (نسخة واحدة/تطوير) يُنفَّذ العمل مباشرةً.
 */
export async function withLock<T>(
  redis: LockRedis | null,
  key: string,
  fn: () => Promise<T>,
  { ttlMs = 5 * 60 * 1000 }: WithLockOptions = {},
): Promise<T | null> {
  // بلا Redis لا يوجد تعدّد نسخ يُنسَّق — نفّذ مباشرةً
  if (!redis) return fn();

  const token = crypto.randomUUID();
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    logger.debug({ lock: key }, 'lock held by another instance, skipping');
    return null;
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_SCRIPT, 1, key, token);
    } catch (err) {
      // انتهاء المهلة سيحرّر القفل تلقائيًا — لا نُفشل المهمة بسبب ذلك
      logger.warn({ err, lock: key }, 'failed to release lock');
    }
  }
}
