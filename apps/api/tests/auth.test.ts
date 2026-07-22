import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
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
      .post('/auth/login')
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
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me without cookie returns 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with cookie returns the user', async () => {
    const user = await createUser('MANAGER');
    const cookie = await loginAs(app, user.email);
    const res = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'MANAGER' });
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/token=;/);
  });
});
