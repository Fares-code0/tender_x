import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const validTender = {
  title: 'توريد أنظمة مراقبة',
  entity: 'وزارة الداخلية',
  closingDate: '2026-10-01T00:00:00.000Z',
  source: 'منصة اعتماد',
  url: 'https://etimad.sa/tender/9001',
  description: 'وصف تجريبي',
};

describe('POST /tenders (M2.2)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('QA creates a tender: 201 + NEW status + audit log + status history', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    expect(res.status).toBe(201);
    expect(res.body.tender).toMatchObject({
      title: validTender.title,
      status: 'NEW',
      createdById: qa.id,
      currentAssigneeId: qa.id,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { tenderId: res.body.tender.id, action: 'TENDER_CREATED' },
    });
    expect(audit).not.toBeNull();

    const history = await prisma.tenderStatusHistory.findMany({
      where: { tenderId: res.body.tender.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'NEW' });
  });

  it('WRITER cannot create a tender: 403', async () => {
    const writer = await createUser('WRITER');
    const cookie = await loginAs(app, writer.email);
    const res = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    expect(res.status).toBe(403);
  });

  it('rejects a tender without closingDate: 422 (BR-010)', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const { closingDate: _omit, ...noDate } = validTender;
    const res = await request(app).post('/tenders').set('Cookie', cookie).send(noDate);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /tenders filters (M2.3)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedTenders() {
    const qa = await createUser('QA');
    const writer = await createUser('WRITER');
    const cookie = await loginAs(app, qa.email);
    const make = (over: Partial<typeof validTender>) =>
      request(app)
        .post('/tenders')
        .set('Cookie', cookie)
        .send({ ...validTender, url: undefined, ...over });

    const a = await make({ title: 'مناقصة شبكات', entity: 'وزارة الصحة', closingDate: '2026-08-01T00:00:00.000Z' });
    const b = await make({ title: 'مناقصة برمجيات', entity: 'وزارة التعليم', closingDate: '2026-09-15T00:00:00.000Z' });
    const c = await make({ title: 'مناقصة صيانة', entity: 'وزارة الصحة', closingDate: '2026-12-01T00:00:00.000Z' });
    // مناقصة معينة لكاتب وحالتها مختلفة
    await prisma.tender.update({
      where: { id: c.body.tender.id },
      data: { status: 'PROPOSAL_PREPARATION', currentAssigneeId: writer.id },
    });
    return { qa, writer, cookie, ids: [a.body.tender.id, b.body.tender.id, c.body.tender.id] };
  }

  it('filters by status', async () => {
    const { cookie } = await seedTenders();
    const res = await request(app).get('/tenders?status=PROPOSAL_PREPARATION').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.tenders[0].title).toBe('مناقصة صيانة');
  });

  it('filters by entity', async () => {
    const { cookie } = await seedTenders();
    const res = await request(app).get('/tenders?entity=' + encodeURIComponent('وزارة الصحة')).set('Cookie', cookie);
    expect(res.body.total).toBe(2);
  });

  it('filters by assigneeId', async () => {
    const { cookie, writer } = await seedTenders();
    const res = await request(app).get(`/tenders?assigneeId=${writer.id}`).set('Cookie', cookie);
    expect(res.body.total).toBe(1);
    expect(res.body.tenders[0].currentAssignee.id).toBe(writer.id);
  });

  it('filters by closingBefore/closingAfter and sorts by closingDate asc', async () => {
    const { cookie } = await seedTenders();
    const res = await request(app)
      .get('/tenders?closingAfter=2026-08-15T00:00:00.000Z&closingBefore=2026-12-31T00:00:00.000Z')
      .set('Cookie', cookie);
    expect(res.body.total).toBe(2);
    const dates = res.body.tenders.map((t: { closingDate: string }) => t.closingDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('paginates', async () => {
    const { cookie } = await seedTenders();
    const res = await request(app).get('/tenders?page=2&pageSize=2').set('Cookie', cookie);
    expect(res.body.total).toBe(3);
    expect(res.body.tenders).toHaveLength(1);
  });

  it('requires auth: 401', async () => {
    const res = await request(app).get('/tenders');
    expect(res.status).toBe(401);
  });
});

describe('GET/PATCH /tenders/:id (M2.4)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns details with assignee and status history', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const created = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    const res = await request(app).get(`/tenders/${created.body.tender.id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tender.currentAssignee.id).toBe(qa.id);
    expect(res.body.tender.statusHistory).toHaveLength(1);
    expect(res.body.tender.statusHistory[0].changedBy.id).toBe(qa.id);
  });

  it('returns 404 for a missing tender', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const res = await request(app).get('/tenders/nonexistent-id').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('PATCH updates fields and writes a new audit entry', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const created = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    const id = created.body.tender.id;

    const res = await request(app)
      .patch(`/tenders/${id}`)
      .set('Cookie', cookie)
      .send({ title: 'عنوان معدل للمناقصة' });
    expect(res.status).toBe(200);
    expect(res.body.tender.title).toBe('عنوان معدل للمناقصة');

    const audits = await prisma.auditLog.findMany({ where: { tenderId: id }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => a.action)).toEqual(['TENDER_CREATED', 'TENDER_UPDATED']);
  });

  it('WRITER cannot PATCH: 403', async () => {
    const qa = await createUser('QA');
    const writer = await createUser('WRITER');
    const qaCookie = await loginAs(app, qa.email);
    const created = await request(app).post('/tenders').set('Cookie', qaCookie).send(validTender);
    const writerCookie = await loginAs(app, writer.email);
    const res = await request(app)
      .patch(`/tenders/${created.body.tender.id}`)
      .set('Cookie', writerCookie)
      .send({ title: 'محاولة تعديل' });
    expect(res.status).toBe(403);
  });

  it('cannot PATCH a submitted/closed tender: 422 TENDER_LOCKED (ACT-02)', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    const created = await request(app).post('/tenders').set('Cookie', cookie).send(validTender);
    const id = created.body.tender.id;
    await prisma.tender.update({ where: { id }, data: { status: 'SUBMITTED' } });

    const res = await request(app)
      .patch(`/tenders/${id}`)
      .set('Cookie', cookie)
      .send({ title: 'محاولة تعديل بعد التقديم' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TENDER_LOCKED');
  });
});

describe('Duplicate warning (M2.5)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects same url with 409, then accepts with force=1', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    await request(app).post('/tenders').set('Cookie', cookie).send(validTender);

    const dup = await request(app)
      .post('/tenders')
      .set('Cookie', cookie)
      .send({ ...validTender, title: 'عنوان مختلف تمامًا', entity: 'جهة أخرى' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TENDER');

    const forced = await request(app)
      .post('/tenders?force=1')
      .set('Cookie', cookie)
      .send({ ...validTender, title: 'عنوان مختلف تمامًا', entity: 'جهة أخرى' });
    expect(forced.status).toBe(201);
  });

  it('rejects same title+entity with 409 even with a different url', async () => {
    const qa = await createUser('QA');
    const cookie = await loginAs(app, qa.email);
    await request(app).post('/tenders').set('Cookie', cookie).send(validTender);

    const dup = await request(app)
      .post('/tenders')
      .set('Cookie', cookie)
      .send({ ...validTender, url: 'https://etimad.sa/tender/9002' });
    expect(dup.status).toBe(409);
  });
});
