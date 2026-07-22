import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

/** يجهّز مناقصة UNDER_REVIEW مع Checklist مكتمل جاهزة للتعيين */
async function reviewedTender(app: Express) {
  const template = await prisma.checklistTemplate.create({
    data: { name: 'قالب', isActive: true, items: { create: [{ text: 'بند', order: 0 }] } },
    include: { items: true },
  });
  const qa = await createUser('QA');
  const writer = await createUser('WRITER');
  const qaCookie = await loginAs(app, qa.email);
  const created = await request(app)
    .post('/tenders')
    .set('Cookie', qaCookie)
    .send({ title: 'مناقصة إشعارات', entity: 'جهة', closingDate: '2026-12-01T00:00:00.000Z' });
  const id = created.body.tender.id as string;
  await request(app).post(`/tenders/${id}/review/start`).set('Cookie', qaCookie);
  await request(app)
    .put(`/tenders/${id}/checklist`)
    .set('Cookie', qaCookie)
    .send({ answers: template.items.map((it) => ({ itemId: it.id, checked: true })) });
  return { id, qa, writer, qaCookie };
}

describe('Notifications from workflow events (M6.1)', () => {
  beforeEach(async () => await resetDb());

  it('assigning a tender notifies the assigned writer specifically', async () => {
    const { id, writer, qa, qaCookie } = await reviewedTender(app);
    const res = await request(app)
      .post(`/tenders/${id}/assign`)
      .set('Cookie', qaCookie)
      .send({ assigneeId: writer.id });
    expect(res.status).toBe(200);

    const writerNotifs = await prisma.notification.findMany({
      where: { userId: writer.id, type: 'ASSIGNED', tenderId: id },
    });
    expect(writerNotifs).toHaveLength(1);
    expect(writerNotifs[0].message).toContain('عُيّنت لك');

    // لا يوجد إشعار تعيين لغير الكاتب المعيّن (مثل QA)
    const qaAssignNotifs = await prisma.notification.count({
      where: { userId: qa.id, type: 'ASSIGNED' },
    });
    expect(qaAssignNotifs).toBe(0);
  });

  it('submit-for-approval notifies managers', async () => {
    const { id, writer, qaCookie } = await reviewedTender(app);
    const manager = await createUser('MANAGER');
    const writerCookie = await loginAs(app, writer.email);
    await request(app)
      .post(`/tenders/${id}/assign`)
      .set('Cookie', qaCookie)
      .send({ assigneeId: writer.id });
    await request(app).post(`/tenders/${id}/submit-for-approval`).set('Cookie', writerCookie);

    const mgrNotifs = await prisma.notification.count({
      where: { userId: manager.id, type: 'SUBMITTED_FOR_APPROVAL', tenderId: id },
    });
    expect(mgrNotifs).toBe(1);
  });
});

describe('Notifications API (M6.3)', () => {
  beforeEach(async () => await resetDb());

  it('lists the user notifications with an unread count', async () => {
    const user = await createUser('QA');
    const cookie = await loginAs(app, user.email);
    await prisma.notification.createMany({
      data: [
        { userId: user.id, type: 'TENDER_CREATED', message: 'أ' },
        { userId: user.id, type: 'ASSIGNED', message: 'ب' },
      ],
    });
    const res = await request(app).get('/notifications').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.unreadCount).toBe(2);
  });

  it('marks a notification as read and decrements the unread count', async () => {
    const user = await createUser('QA');
    const cookie = await loginAs(app, user.email);
    const n = await prisma.notification.create({
      data: { userId: user.id, type: 'ASSIGNED', message: 'ب' },
    });
    const read = await request(app).post(`/notifications/${n.id}/read`).set('Cookie', cookie);
    expect(read.status).toBe(200);
    expect(read.body.notification.isRead).toBe(true);

    const after = await request(app).get('/notifications').set('Cookie', cookie);
    expect(after.body.unreadCount).toBe(0);
  });

  it('cannot mark another user notification as read: 404', async () => {
    const owner = await createUser('QA');
    const other = await createUser('WRITER');
    const otherCookie = await loginAs(app, other.email);
    const n = await prisma.notification.create({
      data: { userId: owner.id, type: 'ASSIGNED', message: 'ب' },
    });
    const res = await request(app).post(`/notifications/${n.id}/read`).set('Cookie', otherCookie);
    expect(res.status).toBe(404);
  });

  it('requires auth: 401', async () => {
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
  });
});
