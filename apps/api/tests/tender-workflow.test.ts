import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const validTender = {
  title: 'مناقصة سير العمل',
  entity: 'وزارة المالية',
  closingDate: '2026-12-01T00:00:00.000Z',
};

async function activeTemplate() {
  return prisma.checklistTemplate.create({
    data: {
      name: 'قالب',
      isActive: true,
      items: { create: [{ text: 'بند', order: 0 }] },
    },
    include: { items: true },
  });
}

/** يجهّز مناقصة ويوصلها إلى الحالة UNDER_REVIEW مع Checklist مكتمل */
async function reviewedTender(app: Express) {
  const template = await activeTemplate();
  const qa = await createUser('QA');
  const writer = await createUser('WRITER');
  const manager = await createUser('MANAGER');
  const qaCookie = await loginAs(app, qa.email);
  const writerCookie = await loginAs(app, writer.email);
  const managerCookie = await loginAs(app, manager.email);
  const created = await request(app).post('/tenders').set('Cookie', qaCookie).send(validTender);
  const id = created.body.tender.id as string;
  await request(app).post(`/tenders/${id}/review/start`).set('Cookie', qaCookie);
  await request(app)
    .put(`/tenders/${id}/checklist`)
    .set('Cookie', qaCookie)
    .send({ answers: template.items.map((it) => ({ itemId: it.id, checked: true })) });
  return { id, qa, writer, manager, qaCookie, writerCookie, managerCookie };
}

async function assignedTender(app: Express) {
  const ctx = await reviewedTender(app);
  await request(app)
    .post(`/tenders/${ctx.id}/assign`)
    .set('Cookie', ctx.qaCookie)
    .send({ assigneeId: ctx.writer.id });
  return ctx;
}

async function pendingApprovalTender(app: Express) {
  const ctx = await assignedTender(app);
  await request(app).post(`/tenders/${ctx.id}/submit-for-approval`).set('Cookie', ctx.writerCookie);
  return ctx;
}

describe('POST /tenders/:id/assign (M4.2)', () => {
  beforeEach(async () => await resetDb());

  it('QA assigns a WRITER: UNDER_REVIEW → PROPOSAL_PREPARATION + assignee set', async () => {
    const { id, writer, qaCookie } = await reviewedTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/assign`)
      .set('Cookie', qaCookie)
      .send({ assigneeId: writer.id });
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('PROPOSAL_PREPARATION');
    expect(res.body.tender.currentAssigneeId).toBe(writer.id);
  });

  it('assigning a non-writer is rejected: 422', async () => {
    const { id, manager, qaCookie } = await reviewedTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/assign`)
      .set('Cookie', qaCookie)
      .send({ assigneeId: manager.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });
});

describe('POST /tenders/:id/submit-for-approval (M4.3)', () => {
  beforeEach(async () => await resetDb());

  it('assigned writer submits: PROPOSAL_PREPARATION → PENDING_APPROVAL', async () => {
    const { id, writerCookie } = await assignedTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/submit-for-approval`)
      .set('Cookie', writerCookie);
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('PENDING_APPROVAL');
  });

  it('a different (non-assigned) writer is rejected: 403', async () => {
    const { id } = await assignedTender(app);
    const other = await createUser('WRITER');
    const otherCookie = await loginAs(app, other.email);
    const res = await request(app)
      .post(`/tenders/${id}/submit-for-approval`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ASSIGNEE');
  });
});

describe('POST /tenders/:id/manager-decision (M4.4)', () => {
  beforeEach(async () => await resetDb());

  it('approve sets managerApprovedAt and keeps PENDING_APPROVAL', async () => {
    const { id, managerCookie } = await pendingApprovalTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('PENDING_APPROVAL');
    expect(res.body.tender.managerApprovedAt).not.toBeNull();
  });

  it('return without notes is rejected: 422 (BR-011)', async () => {
    const { id, managerCookie } = await pendingApprovalTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'return' });
    expect(res.status).toBe(422);
  });

  it('return with notes sends it back to the same writer + clears approval', async () => {
    const { id, writer, managerCookie } = await pendingApprovalTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'return', notes: 'يرجى تحسين الجدول الزمني' });
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('PROPOSAL_PREPARATION');
    expect(res.body.tender.currentAssigneeId).toBe(writer.id);
    expect(res.body.tender.managerApprovedAt).toBeNull();
  });

  it('stop rejects the tender: PENDING_APPROVAL → REJECTED', async () => {
    const { id, managerCookie } = await pendingApprovalTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'stop', reason: 'خارج نطاق الشركة' });
    expect(res.status).toBe(200);
    expect(res.body.tender.status).toBe('REJECTED');
    expect(res.body.tender.rejectionReason).toBe('خارج نطاق الشركة');
  });
});

describe('POST /tenders/:id/mark-submitted + /result (M4.5)', () => {
  beforeEach(async () => await resetDb());

  it('mark-submitted on a not-yet-approved tender is rejected: 422 (BR-004)', async () => {
    const { id, managerCookie } = await pendingApprovalTender(app);
    const res = await request(app).post(`/tenders/${id}/mark-submitted`).set('Cookie', managerCookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_APPROVED');
  });

  it('mark-submitted after approval → SUBMITTED, then result WON → WON', async () => {
    const { id, managerCookie } = await pendingApprovalTender(app);
    await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'approve' });

    const sub = await request(app).post(`/tenders/${id}/mark-submitted`).set('Cookie', managerCookie);
    expect(sub.status).toBe(200);
    expect(sub.body.tender.status).toBe('SUBMITTED');

    const result = await request(app)
      .post(`/tenders/${id}/result`)
      .set('Cookie', managerCookie)
      .send({ result: 'WON' });
    expect(result.status).toBe(200);
    expect(result.body.tender.status).toBe('WON');
  });
});
