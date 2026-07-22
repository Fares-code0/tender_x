import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const validTender = {
  title: 'مناقصة قيد المراجعة',
  entity: 'وزارة الطاقة',
  closingDate: '2026-11-01T00:00:00.000Z',
};

/** ينشئ قالب مراجعة نشطًا ببندين ويعيد بنوده */
async function seedTemplate() {
  const template = await prisma.checklistTemplate.create({
    data: {
      name: 'قالب اختبار',
      isActive: true,
      items: {
        create: [
          { text: 'بند أول', order: 0 },
          { text: 'بند ثانٍ', order: 1 },
        ],
      },
    },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  return template;
}

/** ينشئ مناقصة NEW بواسطة QA ويعيد معرّفها وكوكي الـQA */
async function newTenderAsQa() {
  const qa = await createUser('QA');
  const cookie = await loginAs(app, qa.email);
  const created = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
  return { qa, cookie, id: created.body.tender.id as string };
}

describe('POST /tenders/:id/review/start (M3.3)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('QA moves NEW → UNDER_REVIEW + status history + audit', async () => {
    const { cookie, id } = await newTenderAsQa();
    const res = await request(app).post(`/tenders/${id}/review/start`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('UNDER_REVIEW');

    const history = await prisma.tenderStatusHistory.findMany({
      where: { tenderId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual(['NEW', 'UNDER_REVIEW']);

    const audit = await prisma.auditLog.findFirst({ where: { tenderId: id, action: 'REVIEW_STARTED' } });
    expect(audit).not.toBeNull();
  });

  it('rejects starting review on a non-NEW tender: 422', async () => {
    const { cookie, id } = await newTenderAsQa();
    await prisma.tender.update({ where: { id }, data: { status: 'SUBMITTED' } });
    const res = await request(app).post(`/tenders/${id}/review/start`).set('Cookie', cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('non-QA (WRITER) cannot start review: 403', async () => {
    const { id } = await newTenderAsQa();
    const writer = await createUser('WRITER');
    const wcookie = await loginAs(app, writer.email);
    const res = await request(app).post(`/tenders/${id}/review/start`).set('Cookie', wcookie);
    expect(res.status).toBe(403);
  });
});

describe('PUT/GET /tenders/:id/checklist (M3.4)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('saves answers and retrieves them matching what was sent', async () => {
    const template = await seedTemplate();
    const { cookie, id } = await newTenderAsQa();
    await request(app).post(`/tenders/${id}/review/start`).set('Cookie', cookie);

    const put = await request(app)
      .put(`/tenders/${id}/checklist`)
      .set('Cookie', cookie)
      .send({
        answers: [
          { itemId: template.items[0].id, checked: true, note: 'ملاحظة على البند الأول' },
          { itemId: template.items[1].id, checked: false },
        ],
      });
    expect(put.status).toBe(200);

    const get = await request(app).get(`/tenders/${id}/checklist`).set('Cookie', cookie);
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(2);
    expect(get.body.items[0]).toMatchObject({
      itemId: template.items[0].id,
      checked: true,
      note: 'ملاحظة على البند الأول',
    });
    expect(get.body.items[1]).toMatchObject({ itemId: template.items[1].id, checked: false });
  });
});

describe('POST /tenders/:id/review/decision (M3.5)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function underReviewTender() {
    const template = await seedTemplate();
    const { cookie, id } = await newTenderAsQa();
    await request(app).post(`/tenders/${id}/review/start`).set('Cookie', cookie);
    return { template, cookie, id };
  }

  it('approve with an incomplete checklist: 422 (BR-001)', async () => {
    const { template, cookie, id } = await underReviewTender();
    // بند واحد فقط مؤشَّر من بندين
    await request(app)
      .put(`/tenders/${id}/checklist`)
      .set('Cookie', cookie)
      .send({ answers: [{ itemId: template.items[0].id, checked: true }] });

    const res = await request(app)
      .post(`/tenders/${id}/review/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'approve' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CHECKLIST_INCOMPLETE');
  });

  it('reject without a reason: 422 (BR-002)', async () => {
    const { cookie, id } = await underReviewTender();
    const res = await request(app)
      .post(`/tenders/${id}/review/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'reject', rejectionReason: '' });
    expect(res.status).toBe(422);
  });

  it('reject with a reason: sets REJECTED + stores reason + status history', async () => {
    const { cookie, id } = await underReviewTender();
    const res = await request(app)
      .post(`/tenders/${id}/review/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'reject', rejectionReason: 'عدم توافق النشاط مع المناقصة' });
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('REJECTED');
    expect(res.body.tender.rejectionReason).toBe('عدم توافق النشاط مع المناقصة');

    const history = await prisma.tenderStatusHistory.findFirst({
      where: { tenderId: id, toStatus: 'REJECTED' },
    });
    expect(history).not.toBeNull();
  });

  it('approve with a complete checklist: succeeds and stays UNDER_REVIEW', async () => {
    const { template, cookie, id } = await underReviewTender();
    await request(app)
      .put(`/tenders/${id}/checklist`)
      .set('Cookie', cookie)
      .send({
        answers: template.items.map((it) => ({ itemId: it.id, checked: true })),
      });

    const res = await request(app)
      .post(`/tenders/${id}/review/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
    expect(res.body.tender.status).toBe('UNDER_REVIEW');

    const audit = await prisma.auditLog.findFirst({
      where: { tenderId: id, action: 'REVIEW_APPROVED' },
    });
    expect(audit).not.toBeNull();
  });
});
