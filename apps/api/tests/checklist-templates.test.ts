import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const sampleTemplate = {
  name: 'قالب مراجعة افتراضي',
  items: [
    { text: 'توافق نشاط الشركة مع المناقصة', order: 0 },
    { text: 'الموعد كافٍ لإعداد العرض', order: 1 },
  ],
};

describe('Checklist templates API (M3.1)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('Manager creates a template with items: 201 + audit + items ordered', async () => {
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);
    const res = await request(app)
      .post('/checklist-templates')
      .set('Cookie', cookie)
      .send(sampleTemplate);
    expect(res.status).toBe(201);
    expect(res.body.template.name).toBe(sampleTemplate.name);
    expect(res.body.template.items).toHaveLength(2);
    expect(res.body.template.items.map((i: { text: string }) => i.text)).toEqual([
      'توافق نشاط الشركة مع المناقصة',
      'الموعد كافٍ لإعداد العرض',
    ]);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CHECKLIST_TEMPLATE_CREATED' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.userId).toBe(manager.id);
  });

  it('Admin edits an existing item text via PATCH', async () => {
    const admin = await createUser('ADMIN');
    const cookie = await loginAs(app, admin.email);
    const created = await request(app)
      .post('/checklist-templates')
      .set('Cookie', cookie)
      .send(sampleTemplate);
    const items = created.body.template.items as { id: string; text: string; order: number }[];

    const res = await request(app)
      .patch(`/checklist-templates/${created.body.template.id}`)
      .set('Cookie', cookie)
      .send({
        items: [
          { id: items[0].id, text: 'نص معدّل للبند الأول', order: 0 },
          { id: items[1].id, text: items[1].text, order: 1 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.template.items[0].text).toBe('نص معدّل للبند الأول');
    expect(res.body.template.items).toHaveLength(2);
  });

  it('QA cannot create or edit a template: 403', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app)
      .post('/checklist-templates')
      .set('Cookie', cookie)
      .send(sampleTemplate);
    expect(res.status).toBe(403);
  });
});
