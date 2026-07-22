import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

/**
 * M4.8 — اختبار تكامل E2E بالـAPI: سيناريو كامل من الإنشاء حتى WON،
 * بتسجيل دخول أدوار مختلفة (QA → Writer → Manager) في نفس الاختبار.
 */
describe('E2E tender lifecycle: create → … → WON (M4.8)', () => {
  beforeEach(async () => await resetDb());

  it('runs the full happy path across QA, Writer and Manager', async () => {
    // قالب مراجعة نشط ببندين
    const template = await prisma.checklistTemplate.create({
      data: {
        name: 'قالب المراجعة',
        isActive: true,
        items: { create: [{ text: 'بند 1', order: 0 }, { text: 'بند 2', order: 1 }] },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    const qa = await createUser('QA');
    const writer = await createUser('WRITER');
    const manager = await createUser('MANAGER');
    const qaCookie = await loginAs(app, qa.email);
    const writerCookie = await loginAs(app, writer.email);
    const managerCookie = await loginAs(app, manager.email);

    // 1) QA ينشئ المناقصة (NEW)
    const created = await request(app)
      .post('/tenders')
      .set('Cookie', qaCookie)
      .send({ title: 'مناقصة دورة كاملة', entity: 'وزارة التخطيط', closingDate: '2026-12-31T00:00:00.000Z' });
    expect(created.status).toBe(201);
    const id = created.body.tender.id as string;
    expect(created.body.tender.status).toBe('NEW');

    // 2) QA يبدأ المراجعة (UNDER_REVIEW)
    const started = await request(app).post(`/tenders/${id}/review/start`).set('Cookie', qaCookie);
    expect(started.body.tender.status).toBe('UNDER_REVIEW');

    // 3) QA يعبّئ الـChecklist بالكامل
    const filled = await request(app)
      .put(`/tenders/${id}/checklist`)
      .set('Cookie', qaCookie)
      .send({ answers: template.items.map((it) => ({ itemId: it.id, checked: true })) });
    expect(filled.status).toBe(200);

    // 4) QA يعتمد المراجعة (اكتمال الـChecklist)
    const approvedReview = await request(app)
      .post(`/tenders/${id}/review/decision`)
      .set('Cookie', qaCookie)
      .send({ decision: 'approve' });
    expect(approvedReview.body.approved).toBe(true);

    // 5) QA يعيّن الكاتب (PROPOSAL_PREPARATION)
    const assigned = await request(app)
      .post(`/tenders/${id}/assign`)
      .set('Cookie', qaCookie)
      .send({ assigneeId: writer.id });
    expect(assigned.body.tender.status).toBe('PROPOSAL_PREPARATION');
    expect(assigned.body.tender.currentAssigneeId).toBe(writer.id);

    // 6) الكاتب يرسل للاعتماد (PENDING_APPROVAL)
    const submitted = await request(app)
      .post(`/tenders/${id}/submit-for-approval`)
      .set('Cookie', writerCookie);
    expect(submitted.body.tender.status).toBe('PENDING_APPROVAL');

    // 7) المدير يعتمد (managerApprovedAt)
    const managerApprove = await request(app)
      .post(`/tenders/${id}/manager-decision`)
      .set('Cookie', managerCookie)
      .send({ decision: 'approve' });
    expect(managerApprove.body.tender.managerApprovedAt).not.toBeNull();

    // 8) المدير يسجّل التقديم (SUBMITTED)
    const markSubmitted = await request(app)
      .post(`/tenders/${id}/mark-submitted`)
      .set('Cookie', managerCookie);
    expect(markSubmitted.body.tender.status).toBe('SUBMITTED');

    // 9) المدير يسجّل النتيجة WON
    const won = await request(app)
      .post(`/tenders/${id}/result`)
      .set('Cookie', managerCookie)
      .send({ result: 'WON' });
    expect(won.body.tender.status).toBe('WON');

    // تحقق نهائي: سلسلة الحالات كاملة في StatusHistory
    const history = await prisma.tenderStatusHistory.findMany({
      where: { tenderId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual([
      'NEW',
      'UNDER_REVIEW',
      'PROPOSAL_PREPARATION',
      'PENDING_APPROVAL',
      'SUBMITTED',
      'WON',
    ]);

    // وأن كل خطوة جوهرية سُجّلت في Audit Log (BR-008)
    const actions = (
      await prisma.auditLog.findMany({ where: { tenderId: id }, orderBy: { createdAt: 'asc' } })
    ).map((a) => a.action);
    for (const expected of [
      'TENDER_CREATED',
      'REVIEW_STARTED',
      'REVIEW_APPROVED',
      'ASSIGNED',
      'SUBMITTED_FOR_APPROVAL',
      'MANAGER_APPROVED',
      'MARKED_SUBMITTED',
      'RESULT_RECORDED',
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
