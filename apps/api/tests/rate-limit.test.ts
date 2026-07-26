import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createApp } from '../src/app';
import type { RedisClient } from '../src/lib/redis';
import { RedisRateLimitStore } from '../src/lib/rateLimit';

/**
 * عميل Redis وهمي في الذاكرة — يدعم INCR/DECR/PTTL/PEXPIRE/DEL/MULTI.
 * ملاحظة مهمة: كل نسخ `ioredis-mock` تتشارك نفس المخزن (تحاكي خادمًا واحدًا)،
 * لذا ننظّفه قبل كل اختبار حتى لا تتسرّب العدّادات بين الاختبارات.
 */
function makeRedis(): RedisClient {
  return new RedisMock() as unknown as RedisClient;
}

async function flushRedis(): Promise<void> {
  await (new RedisMock() as unknown as { flushall(): Promise<unknown> }).flushall();
}

const CREDS = { email: 'nobody@test.com', password: 'wrong-pass-123' };

beforeEach(async () => {
  await flushRedis();
});

describe('RedisRateLimitStore (H2.1)', () => {
  it('increments and reports a reset time within the window', async () => {
    const store = new RedisRateLimitStore(makeRedis(), 'test:incr:');
    store.init({ windowMs: 60_000 } as never);

    const first = await store.increment('ip-1');
    const second = await store.increment('ip-1');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime!.getTime()).toBeGreaterThan(Date.now());
    expect(second.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('keeps separate counters per key and resets a single key', async () => {
    const store = new RedisRateLimitStore(makeRedis(), 'test:keys:');
    store.init({ windowMs: 60_000 } as never);

    await store.increment('ip-a');
    await store.increment('ip-a');
    await store.increment('ip-b');
    await store.resetKey('ip-a');

    expect((await store.increment('ip-a')).totalHits).toBe(1);
    expect((await store.increment('ip-b')).totalHits).toBe(2);
  });

  it('decrement gives back one hit', async () => {
    const store = new RedisRateLimitStore(makeRedis(), 'test:decr:');
    store.init({ windowMs: 60_000 } as never);

    await store.increment('ip-1');
    await store.increment('ip-1');
    await store.decrement('ip-1');

    expect((await store.increment('ip-1')).totalHits).toBe(2);
  });
});

// 🔒 بوابة H2: العدّاد مشترك بين نسختين من التطبيق
describe('distributed rate limiting across two app instances (H2.1)', () => {
  it('shares the login counter between two instances backed by the same Redis', async () => {
    const redis = makeRedis();
    // نسختان منفصلتان تمامًا من التطبيق تتشاركان نفس Redis
    const instanceA = createApp({ rateLimit: true, redis });
    const instanceB = createApp({ rateLimit: true, redis });

    // 3 محاولات على النسخة A
    for (let i = 0; i < 3; i++) {
      await request(instanceA).post('/v1/auth/login').send(CREDS);
    }
    // محاولتان على النسخة B → المجموع 5 (الحد)
    for (let i = 0; i < 2; i++) {
      await request(instanceB).post('/v1/auth/login').send(CREDS);
    }

    // الطلب السادس يُرفض على النسخة B رغم أن أول 3 محاولات كانت على A
    const blocked = await request(instanceB).post('/v1/auth/login').send(CREDS);
    expect(blocked.status).toBe(429);

    // ويُرفض كذلك على النسخة A — العدّاد واحد مشترك
    const blockedOnA = await request(instanceA).post('/v1/auth/login').send(CREDS);
    expect(blockedOnA.status).toBe(429);
  });

  it('does NOT share counters with the in-memory store (proves Redis is what makes it distributed)', async () => {
    // بلا Redis: كل نسخة لها مخزنها في الذاكرة (السلوك القديم — Finding #4)
    const instanceA = createApp({ rateLimit: true, redis: null });
    const instanceB = createApp({ rateLimit: true, redis: null });

    for (let i = 0; i < 6; i++) {
      await request(instanceA).post('/v1/auth/login').send(CREDS);
    }
    // النسخة A محظورة الآن
    expect((await request(instanceA).post('/v1/auth/login').send(CREDS)).status).toBe(429);
    // بينما النسخة B لا تزال تقبل — العدّاد غير مشترك
    expect((await request(instanceB).post('/v1/auth/login').send(CREDS)).status).not.toBe(429);
  });
});

describe('Retry-After and global limit (H2.2)', () => {
  it('returns Retry-After on a 429 from the login limiter', async () => {
    const app = createApp({ rateLimit: true, redis: makeRedis() });

    let res = await request(app).post('/v1/auth/login').send(CREDS);
    for (let i = 0; i < 6 && res.status !== 429; i++) {
      res = await request(app).post('/v1/auth/login').send(CREDS);
    }

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('enforces a global per-IP limit across different endpoints', async () => {
    // حد عام منخفض: 3 طلبات في الدقيقة
    const app = createApp({ rateLimit: true, redis: makeRedis(), globalLimit: 3, globalWindowMs: 60_000 });

    // مسارات مختلفة تشترك في نفس العدّاد العام
    await request(app).get('/v1/tenders');
    await request(app).get('/v1/notifications');
    await request(app).get('/v1/users');

    const blocked = await request(app).get('/v1/tenders');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('never rate-limits the health/liveness/readiness probes', async () => {
    const app = createApp({ rateLimit: true, redis: makeRedis(), globalLimit: 1, globalWindowMs: 60_000 });

    // استهلك الحد العام
    await request(app).get('/v1/tenders');
    expect((await request(app).get('/v1/tenders')).status).toBe(429);

    // الفحوص تبقى متاحة للـorchestrator رغم تجاوز الحد
    expect((await request(app).get('/livez')).status).toBe(200);
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });
});
