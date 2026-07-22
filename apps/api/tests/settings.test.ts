import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

describe('System settings API (BR-009 configurable reminder days)', () => {
  beforeEach(async () => await resetDb());

  it('Admin reads settings with the default reminder days', async () => {
    const admin = await createUser('ADMIN');
    const cookie = await loginAs(app, admin.email);
    const res = await request(app).get('/admin/settings').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.settings.closingReminderDays).toBe(3); // الافتراضي
  });

  it('Admin updates the reminder days; GET reflects it + audit logged', async () => {
    const admin = await createUser('ADMIN');
    const cookie = await loginAs(app, admin.email);
    const patch = await request(app)
      .patch('/admin/settings')
      .set('Cookie', cookie)
      .send({ closingReminderDays: 7 });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.closingReminderDays).toBe(7);

    const get = await request(app).get('/admin/settings').set('Cookie', cookie);
    expect(get.body.settings.closingReminderDays).toBe(7);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'SETTINGS_UPDATED' } });
    expect(audit).not.toBeNull();
    expect(audit!.userId).toBe(admin.id);
  });

  it('rejects an invalid value: 422', async () => {
    const admin = await createUser('ADMIN');
    const cookie = await loginAs(app, admin.email);
    const res = await request(app)
      .patch('/admin/settings')
      .set('Cookie', cookie)
      .send({ closingReminderDays: 0 });
    expect(res.status).toBe(422);
  });

  it('non-admin (QA) cannot read or update settings: 403', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const get = await request(app).get('/admin/settings').set('Cookie', cookie);
    const patch = await request(app)
      .patch('/admin/settings')
      .set('Cookie', cookie)
      .send({ closingReminderDays: 5 });
    expect(get.status).toBe(403);
    expect(patch.status).toBe(403);
  });
});
