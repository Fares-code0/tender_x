import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createApp } from '../src/app';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { errorHandler } from '../src/lib/errors';
import { resetDb, createUser, loginAs } from './helpers/db';

const mainApp = createApp();

// تطبيق مصغّر لاختبار الـmiddleware على endpoint محمي بدور MANAGER (M1.4)
const guarded = express();
guarded.use(cookieParser());
guarded.get('/manager-only', requireAuth, requireRole('MANAGER'), (_req, res) => {
  res.json({ ok: true });
});
guarded.use(errorHandler);

describe('requireAuth + requireRole (M1.4)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(guarded).get('/manager-only');
    expect(res.status).toBe(401);
  });

  it('rejects QA on MANAGER-only endpoint with 403', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(mainApp, qa.email);
    const res = await request(guarded).get('/manager-only').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts MANAGER on MANAGER-only endpoint', async () => {
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(mainApp, manager.email);
    const res = await request(guarded).get('/manager-only').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects a user deactivated after login (fresh check per request)', async () => {
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(mainApp, manager.email);
    const { prisma } = await import('../src/lib/prisma');
    await prisma.user.update({ where: { id: manager.id }, data: { isActive: false } });
    const res = await request(guarded).get('/manager-only').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});
