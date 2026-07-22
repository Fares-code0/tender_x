import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';

const app = createApp();

const validTender = {
  title: 'مناقصة بمرفقات',
  entity: 'وزارة الموارد',
  closingDate: '2026-12-15T00:00:00.000Z',
};

/** ينشئ مناقصة (QA) ويعيد id + كوكي كاتب للرفع */
async function tenderWithWriter(app: Express) {
  const qa = await createUser('QA');
  const writer = await createUser('WRITER');
  const qaCookie = await loginAs(app, qa.email);
  const writerCookie = await loginAs(app, writer.email);
  const created = await request(app).post('/tenders').set('Cookie', qaCookie).send(validTender);
  return { id: created.body.tender.id as string, writer, writerCookie, qaCookie };
}

describe('POST /tenders/:id/attachments (M5.1)', () => {
  beforeEach(async () => await resetDb());

  it('WRITER uploads a pdf: 201 + row + audit', async () => {
    const { id, writer, writerCookie } = await tenderWithWriter(app);
    const res = await request(app)
      .post(`/tenders/${id}/attachments`)
      .set('Cookie', writerCookie)
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'proposal.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    expect(res.body.attachment).toMatchObject({ fileName: 'proposal.pdf', version: 1 });
    expect(res.body.attachment.uploadedBy.id).toBe(writer.id);

    const audit = await prisma.auditLog.findFirst({
      where: { tenderId: id, action: 'ATTACHMENT_UPLOADED' },
    });
    expect(audit).not.toBeNull();
  });

  it('preserves an Arabic filename (UTF-8, not garbled)', async () => {
    const { id, writerCookie } = await tenderWithWriter(app);
    const res = await request(app)
      .post(`/tenders/${id}/attachments`)
      .set('Cookie', writerCookie)
      .attach('file', Buffer.from('%PDF arabic name'), {
        filename: 'العرض-الفني.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    expect(res.body.attachment.fileName).toBe('العرض-الفني.pdf');
  });

  it('rejects a .exe file: 422', async () => {
    const { id, writerCookie } = await tenderWithWriter(app);
    const res = await request(app)
      .post(`/tenders/${id}/attachments`)
      .set('Cookie', writerCookie)
      .attach('file', Buffer.from('MZ...'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file larger than 20MB: 413', async () => {
    const { id, writerCookie } = await tenderWithWriter(app);
    const big = Buffer.alloc(21 * 1024 * 1024, 0x41); // 21MB
    const res = await request(app)
      .post(`/tenders/${id}/attachments`)
      .set('Cookie', writerCookie)
      .attach('file', big, { filename: 'huge.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('non-writer (QA) cannot upload: 403', async () => {
    const { id, qaCookie } = await tenderWithWriter(app);
    const res = await request(app)
      .post(`/tenders/${id}/attachments`)
      .set('Cookie', qaCookie)
      .attach('file', Buffer.from('%PDF'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(403);
  });
});

describe('GET list + download (M5.2)', () => {
  beforeEach(async () => await resetDb());

  async function uploadOne(app: Express) {
    const ctx = await tenderWithWriter(app);
    const up = await request(app)
      .post(`/tenders/${ctx.id}/attachments`)
      .set('Cookie', ctx.writerCookie)
      .attach('file', Buffer.from('hello pdf content'), {
        filename: 'file.pdf',
        contentType: 'application/pdf',
      });
    return { ...ctx, attachmentId: up.body.attachment.id as string };
  }

  it('lists attachments with uploader, size and date', async () => {
    const { id, writerCookie } = await uploadOne(app);
    const res = await request(app).get(`/tenders/${id}/attachments`).set('Cookie', writerCookie);
    expect(res.status).toBe(200);
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0]).toMatchObject({ fileName: 'file.pdf' });
    expect(res.body.attachments[0].uploadedBy.name).toBeTruthy();
    expect(res.body.attachments[0].size).toBeGreaterThan(0);
  });

  it('download without auth: 401', async () => {
    const { attachmentId } = await uploadOne(app);
    const res = await request(app).get(`/attachments/${attachmentId}/download`);
    expect(res.status).toBe(401);
  });

  it('download with auth returns the file content', async () => {
    const { attachmentId, writerCookie } = await uploadOne(app);
    const res = await request(app)
      .get(`/attachments/${attachmentId}/download`)
      .set('Cookie', writerCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('file.pdf');
    expect(res.body.toString()).toBe('hello pdf content');
  });
});

describe('Versioning (M5.3)', () => {
  beforeEach(async () => await resetDb());

  it('re-uploading the same filename creates v2 while v1 remains', async () => {
    const { id, writerCookie } = await tenderWithWriter(app);
    const attach = (body: string) =>
      request(app)
        .post(`/tenders/${id}/attachments`)
        .set('Cookie', writerCookie)
        .attach('file', Buffer.from(body), {
          filename: 'report.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

    const v1 = await attach('version one');
    const v2 = await attach('version two');
    expect(v1.body.attachment.version).toBe(1);
    expect(v2.body.attachment.version).toBe(2);

    const all = await prisma.attachment.findMany({
      where: { tenderId: id, fileName: 'report.docx' },
      orderBy: { version: 'asc' },
    });
    expect(all.map((a) => a.version)).toEqual([1, 2]);
    // النسختان لهما مساران مختلفان (القديمة باقية)
    expect(new Set(all.map((a) => a.storagePath)).size).toBe(2);
  });
});
