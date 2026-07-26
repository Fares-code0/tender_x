import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { API_V1, UNVERSIONED_PATHS } from '../src/lib/apiVersion';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

describe('API versioning (H6.3)', () => {
  beforeEach(async () => await resetDb());

  it('serves the business API under /v1', async () => {
    const user = await createUser('QA');
    const cookie = await loginAs(app, user.email);

    const res = await request(app).get(`${API_V1}/tenders`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tenders)).toBe(true);
  });

  it('no longer serves business routes at the unversioned path', async () => {
    const user = await createUser('QA');
    const cookie = await loginAs(app, user.email);

    // المسار القديم لم يعد موجودًا — النسخنة حقيقية لا مجرد إضافة
    for (const path of ['/tenders', '/auth/me', '/notifications', '/dashboard']) {
      const res = await request(app).get(path).set('Cookie', cookie);
      expect(res.status).toBe(404);
    }
  });

  it('keeps infrastructure probes unversioned', async () => {
    // عقد مع المنسّق/الكاشط: لا يتغيّر مع نسخة الـAPI
    for (const path of UNVERSIONED_PATHS) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
    }
  });

  it('applies the login rate limiter to the versioned login path', async () => {
    // الحد كان مربوطًا بـ'/auth/login'؛ لو لم يتبع البادئة لصار بلا أثر بصمت
    const rlApp = createApp({ rateLimit: true, redis: null });
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(rlApp)
        .post(`${API_V1}/auth/login`)
        .send({ email: 'nobody@test.com', password: 'wrong-pass-123' });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
