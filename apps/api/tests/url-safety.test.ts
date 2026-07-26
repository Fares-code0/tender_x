import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, loginAs } from './helpers/db';
import { API_V1 } from '../src/lib/apiVersion';

const app = createApp();

const base = {
  title: 'مناقصة',
  entity: 'جهة',
  closingDate: '2026-12-01T00:00:00.000Z',
};

/**
 * XSS مخزَّنة عبر حقل الرابط: `z.string().url()` وحدها تقبل `javascript:`
 * والواجهة تعرض القيمة داخل `<a href>` — فيُنفَّذ السكربت في جلسة من يفتحها.
 */
describe('Stored XSS via the tender URL field is blocked', () => {
  beforeEach(async () => await resetDb());

  const dangerous = [
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ];

  it.each(dangerous)('rejects %s on create with 422', async (url) => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);

    const res = await request(app)
      .post(`${API_V1}/tenders`)
      .set('Cookie', cookie)
      .send({ ...base, url });

    expect(res.status).toBe(422);
  });

  it('rejects a dangerous URL on update too', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const created = await request(app).post(`${API_V1}/tenders`).set('Cookie', cookie).send(base);
    const id = created.body.tender.id as string;

    const res = await request(app)
      .patch(`${API_V1}/tenders/${id}`)
      .set('Cookie', cookie)
      .send({ url: 'javascript:alert(1)' });

    expect(res.status).toBe(422);
  });

  it('still accepts ordinary http and https links', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);

    const urls = ['https://example.com/tender/1', 'http://intranet.local/x?y=1'];
    for (const [i, url] of urls.entries()) {
      // عنوان مختلف لكل مناقصة وإلا اصطدمنا بتحذير التكرار (M2.5 — 409)
      const res = await request(app)
        .post(`${API_V1}/tenders`)
        .set('Cookie', cookie)
        .send({ ...base, title: `${base.title} ${i}`, url });
      expect(res.status).toBe(201);
      expect(res.body.tender.url).toBe(url);
    }
  });
});
