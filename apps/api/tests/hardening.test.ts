import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const validTender = {
  title: 'مناقصة سجل',
  entity: 'جهة',
  closingDate: '2026-12-01T00:00:00.000Z',
};

describe('Audit log endpoint (M8.1)', () => {
  beforeEach(async () => await resetDb());

  async function tenderWithAudit() {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const created = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    return { id: created.body.tender.id as string };
  }

  it('Manager reads a tender audit log (who/what/when)', async () => {
    const { id } = await tenderWithAudit();
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);
    const res = await request(app).get(`/tenders/${id}/audit`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    const entry = res.body.entries[0];
    expect(entry.action).toBeTruthy();
    expect(entry.user.name).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
  });

  it('QA cannot read the audit log: 403', async () => {
    const { id } = await tenderWithAudit();
    const qa2 = await createUser('QA');
    const cookie = await loginAs(app, qa2.email);
    const res = await request(app).get(`/tenders/${id}/audit`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('audit log is read-only: no DELETE/PATCH endpoint', async () => {
    const { id } = await tenderWithAudit();
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);
    const del = await request(app).delete(`/tenders/${id}/audit`).set('Cookie', cookie);
    const patch = await request(app).patch(`/tenders/${id}/audit`).set('Cookie', cookie);
    expect(del.status).toBe(404); // لا مسار حذف
    expect(patch.status).toBe(404); // لا مسار تعديل
  });
});

describe('Login rate limiting (M8.2)', () => {
  beforeEach(async () => await resetDb());

  it('returns 429 after 6 consecutive login attempts', async () => {
    const rlApp = createApp({ rateLimit: true });
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(rlApp)
        .post('/auth/login')
        .send({ email: 'nobody@test.com', password: 'wrong-pass-123' });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
