import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import RedisMock from 'ioredis-mock';
import { LocalDiskStorage, type StorageService } from '../src/services/storage';
import { S3Storage, type S3Like } from '../src/services/s3Storage';
import { withLock, type LockRedis } from '../src/lib/lock';
import { cached, invalidate, type CacheRedis } from '../src/lib/cache';

/**
 * H5.1 — حاوية S3 وهمية في الذاكرة تُنفّذ العقد الذي نستخدمه فعلًا
 * (Put/Get/Delete)، فنتحقق من المحوّل بلا شبكة أو خدمة حقيقية.
 */
class FakeS3 implements S3Like {
  readonly objects = new Map<string, Buffer>();

  async send(command: unknown): Promise<unknown> {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = (command as { input: Record<string, unknown> }).input;
    const key = String(input.Key);

    if (name === 'PutObjectCommand') {
      this.objects.set(key, await toBuffer(input.Body));
      return {};
    }
    if (name === 'GetObjectCommand') {
      const data = this.objects.get(key);
      if (!data) throw new Error(`NoSuchKey: ${key}`);
      const { Readable } = await import('node:stream');
      return { Body: Readable.from(data) };
    }
    if (name === 'DeleteObjectCommand') {
      this.objects.delete(key);
      return {};
    }
    throw new Error(`unexpected command ${name}`);
  }
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const c of body as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

async function tmpFileWith(contents: string): Promise<string> {
  const p = path.join(os.tmpdir(), `tender-test-${Math.random().toString(36).slice(2)}`);
  await fs.writeFile(p, contents);
  return p;
}

/** عقد مشترك: أي محوّل تخزين يجب أن يجتازه — يثبت أن S3 بديل مباشر للقرص المحلي */
function storageContract(name: string, make: () => StorageService) {
  describe(`StorageService contract: ${name} (H5.1)`, () => {
    it('saves and reads a buffer', async () => {
      const s = make();
      await s.save('a/b.txt', Buffer.from('hello'));
      expect((await s.read('a/b.txt')).toString()).toBe('hello');
    });

    it('saves from a file path without buffering it', async () => {
      const s = make();
      const src = await tmpFileWith('from-disk');
      await s.saveFromFile('c/d.txt', src);
      expect((await s.read('c/d.txt')).toString()).toBe('from-disk');
    });

    it('exposes a read stream', async () => {
      const s = make();
      await s.save('e/f.txt', Buffer.from('streamed'));
      const chunks: Buffer[] = [];
      for await (const c of s.createReadStream('e/f.txt')) chunks.push(c as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('streamed');
    });

    it('deletes an object', async () => {
      const s = make();
      await s.save('g/h.txt', Buffer.from('bye'));
      await s.delete('g/h.txt');
      await expect(s.read('g/h.txt')).rejects.toThrow();
    });
  });
}

storageContract('LocalDiskStorage', () => {
  const dir = path.join(os.tmpdir(), `tender-store-${Math.random().toString(36).slice(2)}`);
  return new LocalDiskStorage(dir);
});
storageContract('S3Storage', () => new S3Storage('test-bucket', new FakeS3()));

describe('S3 storage is shared across instances (H5.1)', () => {
  it('an object written by one instance is readable by another', async () => {
    // حاوية واحدة، عميلان منفصلان — يحاكي نسختي تطبيق خلف نفس التخزين
    const bucket = new FakeS3();
    const instanceA = new S3Storage('shared-bucket', bucket);
    const instanceB = new S3Storage('shared-bucket', bucket);

    const src = await tmpFileWith('uploaded on A');
    await instanceA.saveFromFile('tender-1/file.pdf', src);

    // النسخة B تقرأ ما رفعته A — وهو ما يستحيل مع القرص المحلي (Finding #5)
    expect((await instanceB.read('tender-1/file.pdf')).toString()).toBe('uploaded on A');
  });

  it('local disk storage does NOT share between separate directories (the old failure mode)', async () => {
    const a = new LocalDiskStorage(
      path.join(os.tmpdir(), `inst-a-${Math.random().toString(36).slice(2)}`),
    );
    const b = new LocalDiskStorage(
      path.join(os.tmpdir(), `inst-b-${Math.random().toString(36).slice(2)}`),
    );
    await a.save('x.txt', Buffer.from('only on A'));
    await expect(b.read('x.txt')).rejects.toThrow();
  });

  it('applies the configured key prefix', async () => {
    const bucket = new FakeS3();
    const s = new S3Storage('b', bucket, 'attachments/');
    await s.save('k.txt', Buffer.from('v'));
    expect([...bucket.objects.keys()]).toEqual(['attachments/k.txt']);
  });
});

describe('Distributed cron lock (H5.2)', () => {
  let redis: LockRedis;

  beforeEach(async () => {
    await (new RedisMock() as unknown as { flushall(): Promise<unknown> }).flushall();
    redis = new RedisMock() as unknown as LockRedis;
  });

  it('runs the job exactly once when several instances fire together', async () => {
    const runs = vi.fn().mockResolvedValue('done');
    const job = () =>
      withLock(redis, 'lock:cron:test', async () => {
        // مهمة تستغرق وقتًا: تضمن تداخل المحاولات فعلًا
        await new Promise((r) => setTimeout(r, 30));
        return runs();
      });

    // خمس "نسخ" تشغّل نفس المهمة في نفس اللحظة
    const results = await Promise.all([job(), job(), job(), job(), job()]);

    expect(runs).toHaveBeenCalledTimes(1);
    // نسخة واحدة نفّذت، والباقي تخطّى (null)
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(4);
  });

  it('releases the lock so a later run can acquire it', async () => {
    const first = await withLock(redis, 'lock:cron:test', async () => 'first');
    const second = await withLock(redis, 'lock:cron:test', async () => 'second');
    expect(first).toBe('first');
    expect(second).toBe('second');
  });

  it('releases the lock even when the job throws', async () => {
    await expect(
      withLock(redis, 'lock:cron:test', async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');

    // القفل تحرّر رغم الفشل
    expect(await withLock(redis, 'lock:cron:test', async () => 'after')).toBe('after');
  });

  it('does not delete a lock that another instance now owns', async () => {
    // النسخة A تستحوذ برمز خاص بها
    await redis.set('lock:x', 'token-A', 'PX', 50, 'NX');
    // انتهت المهلة واستحوذت B
    await new Promise((r) => setTimeout(r, 80));
    await redis.set('lock:x', 'token-B', 'PX', 5000, 'NX');

    // محاولة A تحرير القفل يجب ألا تحذف قفل B
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      'lock:x',
      'token-A',
    );

    const stillHeld = await redis.set('lock:x', 'token-C', 'PX', 5000, 'NX');
    expect(stillHeld).toBeNull(); // قفل B ما زال قائمًا
  });

  it('runs directly when Redis is not configured (single instance)', async () => {
    const runs = vi.fn().mockResolvedValue(7);
    const result = await withLock(null, 'lock:none', runs);
    expect(result).toBe(7);
    expect(runs).toHaveBeenCalledTimes(1);
  });
});

describe('Redis cache for hot reads (H5.3)', () => {
  let redis: CacheRedis;

  beforeEach(async () => {
    await (new RedisMock() as unknown as { flushall(): Promise<unknown> }).flushall();
    redis = new RedisMock() as unknown as CacheRedis;
  });

  it('serves the second read from cache without touching the source', async () => {
    const source = vi.fn().mockResolvedValue({ total: 42 });

    const first = await cached(redis, 'cache:test', source, 60);
    const second = await cached(redis, 'cache:test', source, 60);

    expect(first).toEqual({ total: 42 });
    expect(second).toEqual({ total: 42 });
    expect(source).toHaveBeenCalledTimes(1); // القراءة الثانية من الكاش
  });

  it('recomputes after invalidation', async () => {
    const source = vi.fn().mockResolvedValue('v');
    await cached(redis, 'cache:test', source, 60);
    await invalidate(redis, 'cache:test');
    await cached(redis, 'cache:test', source, 60);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('falls back to the source when Redis is unavailable (cache is optional)', async () => {
    const source = vi.fn().mockResolvedValue('fresh');
    const broken: CacheRedis = {
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
      del: () => Promise.reject(new Error('redis down')),
    };

    // لا يرمي: تعطّل الكاش يُبطئ ولا يُسقط الميزة
    expect(await cached(broken, 'cache:test', source, 60)).toBe('fresh');
    expect(await cached(null, 'cache:test', source, 60)).toBe('fresh');
  });
});
