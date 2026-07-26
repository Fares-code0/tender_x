import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, TEST_PASSWORD } from './helpers/db';
import { env } from '../src/lib/env';

// تحديد المعدل معطّل هنا حتى نختبر قفل الحساب نفسه لا حد الـIP
const app = createApp();

const WRONG = 'definitely-wrong-password';

async function failLogin(email: string) {
  return request(app).post('/auth/login').send({ email, password: WRONG });
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
      .post('/auth/login')
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
      .post('/auth/login')
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
      .post('/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored!.failedLoginAttempts).toBe(0);
    expect(stored!.lockedUntil).toBeNull();
  });

  it('counts attempts per account, not globally', async () => {
    const victim = await createUser('QA');
    const other = await createUser('WRITER');

    for (let i = 0; i < env.loginMaxFailedAttempts; i++) await failLogin(victim.email);

    // حساب آخر لم يتأثر بقفل الأول
    const res = await request(app)
      .post('/auth/login')
      .send({ email: other.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });
});
