import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app';
import { resetDb, createUser, loginAs, TEST_PASSWORD } from './helpers/db';

const app = createApp();

describe('Auth API (M1.3)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('logs in with correct credentials: 200 + httpOnly cookie + user', async () => {
    const user = await createUser('QA');
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: user.email, role: 'QA' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('token=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('rejects wrong password with 401', async () => {
    const user = await createUser('QA');
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  // S2 — قناة توقيت: الردّ على بريد غير موجود كان يعود قبل bcrypt (3ms) بينما
  // بريد موجود بكلمة مرور خاطئة يدفع كلفة التجزئة (80ms). الفارق وحده يكشف
  // أي البُرد مسجَّل فعلًا، فيتحوّل نموذج الدخول إلى أداة تعداد للموظفين.
  it('still hashes when the email is unknown (closes the timing oracle)', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    try {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: 'nobody@test.com', password: TEST_PASSWORD });

      expect(res.status).toBe(401);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  // الرسالة والرمز يجب أن يتطابقا حرفيًا، وإلا عاد التعداد من باب آخر
  it('returns an identical body for an unknown email and a wrong password', async () => {
    const user = await createUser('QA');

    const unknown = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });
    const wrongPassword = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' });

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body).toEqual(wrongPassword.body);
  });

  it('GET /auth/me without cookie returns 401', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with cookie returns the user', async () => {
    const user = await createUser('MANAGER');
    const cookie = await loginAs(app, user.email);
    const res = await request(app).get('/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'MANAGER' });
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/token=;/);
  });

  // H1.2 — CSRF hardening: the session cookie is SameSite=Strict
  it('login cookie is SameSite=Strict', async () => {
    const user = await createUser('QA');
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(String(res.headers['set-cookie']).toLowerCase()).toContain('samesite=strict');
  });

  // H1.3 — session revocation: a token reused after logout is rejected even before it expires
  it('revokes the token on logout (reused token → 401)', async () => {
    const user = await createUser('QA');
    const cookie = await loginAs(app, user.email);

    const before = await request(app).get('/v1/auth/me').set('Cookie', cookie);
    expect(before.status).toBe(200);

    const out = await request(app).post('/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);

    const after = await request(app).get('/v1/auth/me').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});
