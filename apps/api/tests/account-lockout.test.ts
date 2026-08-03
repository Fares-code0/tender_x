import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, TEST_PASSWORD } from './helpers/db';
import { env } from '../src/lib/env';
import { lockDurationMs } from '../src/services/loginThrottle';

// تحديد المعدل معطّل هنا حتى نختبر قفل الحساب نفسه لا حد الـIP
const app = createApp();

const WRONG = 'definitely-wrong-password';

async function failLogin(email: string) {
  return request(app).post('/v1/auth/login').send({ email, password: WRONG });
}

describe('Account lockout after repeated failed logins (H2.3)', () => {
  beforeEach(async () => await resetDb());

  it('locks the account with 423 once the failed-attempt limit is reached', async () => {
    const user = await createUser('QA');

    // المحاولات قبل الأخيرة تُرفض بـ401
    for (let i = 0; i < env.loginMaxFailedAttempts - 1; i++) {
      const res = await failLogin(user.email);
      expect(res.status).toBe(401);
    }

    // المحاولة التي تبلغ الحد تُقفل الحساب
    const locking = await failLogin(user.email);
    expect(locking.status).toBe(423);
    expect(locking.body.error.code).toBe('ACCOUNT_LOCKED');

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored!.lockedUntil).toBeTruthy();
    expect(stored!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects even the CORRECT password while the account is locked', async () => {
    const user = await createUser('QA');
    for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(user.email);

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('allows login again once the lock has expired', async () => {
    const user = await createUser('QA');
    for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(user.email);

    // اجعل القفل منتهيًا (بدل انتظار المهلة الحقيقية)
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('resets the failed-attempt counter after a successful login', async () => {
    const user = await createUser('QA');
    await failLogin(user.email);
    await failLogin(user.email);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.failedLoginAttempts).toBe(2);

    const ok = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored!.failedLoginAttempts).toBe(0);
    expect(stored!.lockedUntil).toBeNull();
  });

  // S4 — القفل الثابت (ربع ساعة من أول بلوغ للحد) كان سلاحًا بيد المهاجم لا
  // ضدّه: خمسة طلبات تُسكت حساب أي موظف يُعرف بريده، وتكرارها يُبقيه مُقفلًا
  // إلى ما لا نهاية. التأخير المتصاعد يبقي التخمين بلا جدوى (يتضاعف مع كل
  // محاولة) بينما يبقى الضرر على المستخدم الحقيقي ثوانيَ لا ربع ساعة.
  describe('progressive delay (S4)', () => {
    const lockMs = (u: { lockedUntil: Date | null }) =>
      u.lockedUntil ? u.lockedUntil.getTime() - Date.now() : 0;

    it('escalates and caps the window', () => {
      expect(lockDurationMs(1)).toBe(0);
      expect(lockDurationMs(4)).toBe(0);
      expect(lockDurationMs(5)).toBe(30_000);
      expect(lockDurationMs(6)).toBe(60_000);
      expect(lockDurationMs(7)).toBe(120_000);
      // لا يتجاوز الحدّ الأقصى مهما تكرّرت المحاولات
      expect(lockDurationMs(50)).toBe(env.loginLockMinutes * 60_000);
    });

    it('locks for seconds, not the full maximum, on the first breach', async () => {
      const user = await createUser('QA');
      for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(user.email);

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(lockMs(stored!)).toBeGreaterThan(20_000);
      expect(lockMs(stored!)).toBeLessThanOrEqual(30_000);
    });

    it('keeps counting past the limit so each further breach costs more', async () => {
      const user = await createUser('QA');
      for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(user.email);

      // انقضاء النافذة الأولى (بدل انتظارها فعلًا)
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await failLogin(user.email);

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored!.failedLoginAttempts).toBe(env.loginMaxFailedAttempts + 1);
      expect(lockMs(stored!)).toBeGreaterThan(50_000);
      expect(lockMs(stored!)).toBeLessThanOrEqual(60_000);
    });
  });

  it('counts attempts per account, not globally', async () => {
    const victim = await createUser('QA');
    const other = await createUser('WRITER');

    for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(victim.email);

    // حساب آخر لم يتأثر بقفل الأول
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: other.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });
});
