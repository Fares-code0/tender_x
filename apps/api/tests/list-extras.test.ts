import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

describe('Tenders list sort (SCR-03 filter gap)', () => {
  beforeEach(async () => await resetDb());

  it('sort=closing_desc orders tenders by closingDate descending', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const make = (title: string, closingDate: string, url: string) =>
      request(app)
        .post('/tenders')
        .set('Cookie', cookie)
        .send({ title, entity: 'جهة', closingDate, url });
    await make('أ', '2026-08-01T00:00:00.000Z', 'u1');
    await make('ب', '2026-10-01T00:00:00.000Z', 'u2');
    await make('ج', '2026-09-01T00:00:00.000Z', 'u3');

    const asc = await request(app).get('/tenders?sort=closing_asc').set('Cookie', cookie);
    const desc = await request(app).get('/tenders?sort=closing_desc').set('Cookie', cookie);

    const ascDates = asc.body.tenders.map((t: { closingDate: string }) => t.closingDate);
    const descDates = desc.body.tenders.map((t: { closingDate: string }) => t.closingDate);
    expect(ascDates).toEqual([...ascDates].sort());
    expect(descDates).toEqual([...descDates].sort().reverse());
  });
});

describe('GET /users (assignee-filter dropdown source)', () => {
  beforeEach(async () => await resetDb());

  it('returns id/name/role for an authenticated user', async () => {
    const qa = await createUser('QA');
    await createUser('WRITER');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app).get('/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    expect(res.body.users[0]).toHaveProperty('name');
    expect(res.body.users[0]).toHaveProperty('role');
    expect(res.body.users[0]).not.toHaveProperty('email'); // حقول مختصرة فقط
  });

  it('requires auth: 401', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });
});
