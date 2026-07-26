import rateLimit, { type Store, type ClientRateLimitInfo, type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { RedisClient } from './redis';

/**
 * H2.1 — مخزن تحديد معدل مدعوم بـRedis (نافذة ثابتة).
 *
 * يستخدم `INCR` + `PTTL` داخل `MULTI` فتكون الزيادة وقراءة المهلة ذرّية،
 * ما يجعل العدّاد **مشتركًا بين كل نسخ التطبيق** بدل عدّاد منفصل في ذاكرة كل نسخة.
 *
 * لم نستخدم `rate-limit-redis` لأنه يتطلب `SCRIPT LOAD` (Lua) وهو غير مدعوم في
 * بيئة الاختبار المحلية (لا Redis أصلي على Windows بلا Docker) فيتعذّر التحقق منه.
 */
export class RedisRateLimitStore implements Store {
  /** المفاتيح عامة على مستوى كل النسخ (ليست محلية) */
  localKeys = false;

  private windowMs = 60_000;

  constructor(
    private readonly client: RedisClient,
    /** بادئة المفاتيح — جزء من واجهة Store (تُستخدم لكشف العدّ المزدوج) */
    readonly prefix = 'rl:',
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const k = this.key(key);
    // ذرّي: زيادة العدّاد وقراءة المهلة المتبقية في عملية واحدة
    const results = await this.client.multi().incr(k).pttl(k).exec();
    const totalHits = Number(results?.[0]?.[1] ?? 0);
    let ttl = Number(results?.[1]?.[1] ?? -1);

    // أول طلب في النافذة (أو مفتاح بلا مهلة بعد إعادة تشغيل) → اضبط المهلة
    if (ttl < 0) {
      await this.client.pexpire(k, this.windowMs);
      ttl = this.windowMs;
    }

    return { totalHits, resetTime: new Date(Date.now() + ttl) };
  }

  /** يُستخدم مع `skipSuccessfulRequests` لإرجاع العدّاد خطوة واحدة. */
  async decrement(key: string): Promise<void> {
    await this.client.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }
}

/**
 * H2.2 — معالج التجاوز: يضيف رأس `Retry-After` (بالثواني) مع رسالة عربية موحّدة.
 * express-rate-limit لا يضبط `Retry-After` إلا مع الرؤوس القديمة، فنضبطه صراحةً.
 */
function limitHandler(_req: Request, res: Response, _next: unknown, options: Options): void {
  const resetTime = (res as Response & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfterSec = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(options.windowMs / 1000);

  res.setHeader('Retry-After', String(retryAfterSec));
  res.status(options.statusCode).json({
    error: { code: 'RATE_LIMITED', message: 'محاولات كثيرة، حاول لاحقًا' },
  });
}

export interface LimiterOptions {
  windowMs: number;
  limit: number;
  /** بادئة مفاتيح Redis حتى لا تتداخل الحدود المختلفة */
  prefix: string;
  /** عميل Redis؛ عند غيابه يُستخدم المخزن الافتراضي في الذاكرة */
  redis?: RedisClient | null;
}

/**
 * ينشئ محدّد معدل يستخدم Redis عند توفره (موزّع) أو الذاكرة عند غيابه.
 */
export function createLimiter({ windowMs, limit, prefix, redis }: LimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitHandler,
    ...(redis ? { store: new RedisRateLimitStore(redis, prefix) } : {}),
  });
}
