import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs, TEST_PASSWORD } from './helpers/db';

const app = createApp();

describe('Admin users API (M1.5)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('admin creates a user successfully (201) + audit log row', async () => {
    const admin = await createUser('ADMIN');
    const cookie = await loginAs(app, admin.email);
    const res = await request(app).post('/admin/users').set('Cookie', cookie).send({
      name: 'كاتب جديد',
      email: 'new-writer@test.com',
      password: 'StrongPass1',
      role: 'WRITER',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new-writer@test.com', role: 'WRITER' });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_CREATED' } });
    expect(audit).not.toBeNull();
    expect(audit!.userId).toBe(admin.id);
  });

  it('non-admin (QA) gets 403', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app).post('/admin/users').set('Cookie', cookie).send({
      name: 'اختبار',
      email: 'x@test.com',
      password: 'StrongPass1',
      role: 'WRITER',
    });
    expect(res.status).toBe(403);
  });

  it('duplicate email returns 409', async () => {
    const admin = await createUser('ADMIN');
    const existing = await createUser('WRITER');
    const cookie = await loginAs(app, admin.email);
    const res = await request(app).post('/admin/users').set('Cookie', cookie).send({
      name: 'مكرر',
      email: existing.email,
      password: 'StrongPass1',
      role: 'WRITER',
    });
    expect(res.status).toBe(409);
  });

  it('disabled user (isActive=false) cannot login', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('WRITER');
    const cookie = await loginAs(app, admin.email);

    const patch = await request(app)
      .patch(`/admin/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.user.isActive).toBe(false);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('admin changes a user role', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('WRITER');
    const cookie = await loginAs(app, admin.email);
    const res = await request(app)
      .patch(`/admin/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ role: 'QA' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('QA');
  });
});
