import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, loginAs } from './helpers/db';
import { buildDatabaseUrl } from '../src/lib/prisma';
import { MAX_PAGE_SIZE } from '../src/lib/pagination';
import { storage } from '../src/services/storage';

const app = createApp();

describe('Pagination on previously unbounded lists (H4.3)', () => {
  beforeEach(async () => await resetDb());

  it('paginates the tender audit log and reports the total', async () => {
    const qa = await createUser('QA');
    const manager = await createUser('MANAGER');
    const qaCookie = await loginAs(app, qa.email);
    const created = await request(app).post('/v1/tenders').set('Cookie', qaCookie).send({
      title: 'مناقصة',
      entity: 'جهة',
      closingDate: '2026-12-01T00:00:00.000Z',
    });
    const tenderId = created.body.tender.id as string;

    // اصنع سجلات تدقيق كثيرة
    for (let i = 0; i < 7; i++) {
      await prisma.auditLog.create({
        data: { userId: qa.id, tenderId, action: `ACTION_${i}`, details: {} },
      });
    }

    const cookie = await loginAs(app, manager.email);
    const firstPage = await request(app)
      .get(`/v1/tenders/${tenderId}/audit?page=1&pageSize=3`)
      .set('Cookie', cookie);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.entries).toHaveLength(3);
    expect(firstPage.body.total).toBeGreaterThanOrEqual(8);
    expect(firstPage.body.page).toBe(1);

    const secondPage = await request(app)
      .get(`/v1/tenders/${tenderId}/audit?page=2&pageSize=3`)
      .set('Cookie', cookie);
    expect(secondPage.body.entries).toHaveLength(3);
    // صفحة مختلفة فعلًا
    expect(secondPage.body.entries[0].id).not.toBe(firstPage.body.entries[0].id);
  });

  it('rejects a page size above the maximum instead of running an unbounded query', async () => {
    const manager = await createUser('MANAGER');
    const cookie = await loginAs(app, manager.email);

    const res = await request(app)
      .get(`/v1/users?pageSize=${MAX_PAGE_SIZE + 1}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(422);
  });

  it('caps the users list and returns the total so truncation is detectable', async () => {
    const me = await createUser('MANAGER');
    const cookie = await loginAs(app, me.email);

    const res = await request(app).get('/v1/users?pageSize=2').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeLessThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('paginates the admin users list', async () => {
    const admin = await createUser('ADMIN');
    for (let i = 0; i < 4; i++) await createUser('QA');
    const cookie = await loginAs(app, admin.email);

    const res = await request(app).get('/v1/admin/users?page=1&pageSize=2').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });
});

describe('Prisma connection pool configuration (H4.4)', () => {
  it('appends connection_limit and pool_timeout to the database URL', () => {
    const url = buildDatabaseUrl('postgresql://u:p@localhost:5432/db', 7, 12);
    expect(url).toContain('connection_limit=7');
    expect(url).toContain('pool_timeout=12');
  });

  it('leaves the URL untouched when nothing is configured', () => {
    const raw = 'postgresql://u:p@localhost:5432/db';
    expect(buildDatabaseUrl(raw, undefined, undefined)).toBe(raw);
  });

  it('never overrides a value the operator set explicitly (e.g. PgBouncer)', () => {
    const raw = 'postgresql://u:p@localhost:5432/db?connection_limit=1&pgbouncer=true';
    const url = buildDatabaseUrl(raw, 20, undefined);
    expect(url).toContain('connection_limit=1');
    expect(url).not.toContain('connection_limit=20');
    expect(url).toContain('pgbouncer=true');
  });
});

describe('Streaming uploads and downloads (H4.5)', () => {
  beforeEach(async () => await resetDb());

  async function setupTender() {
    const writer = await createUser('WRITER');
    const qa = await createUser('QA');
    const qaCookie = await loginAs(app, qa.email);
    const created = await request(app).post('/v1/tenders').set('Cookie', qaCookie).send({
      title: 'مناقصة',
      entity: 'جهة',
      closingDate: '2026-12-01T00:00:00.000Z',
    });
    const tenderId = created.body.tender.id as string;
    await prisma.tender.update({
      where: { id: tenderId },
      data: { currentAssigneeId: writer.id, status: 'PROPOSAL_PREPARATION' },
    });
    return { tenderId, writerCookie: await loginAs(app, writer.email) };
  }

  it('round-trips a multi-megabyte file without buffering it in the heap', async () => {
    const { tenderId, writerCookie } = await setupTender();
    // 5MB — أكبر بكثير من أي شيء نريد حجزه في الذاكرة لكل طلب
    const big = Buffer.alloc(5 * 1024 * 1024, 'a');

    const uploaded = await request(app)
      .post(`/v1/tenders/${tenderId}/attachments`)
      .set('Cookie', writerCookie)
      .attach('file', big, 'big.pdf');

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachment.size).toBe(big.length);

    const downloaded = await request(app)
      .get(`/v1/attachments/${uploaded.body.attachment.id}/download`)
      .set('Cookie', writerCookie)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(downloaded.status).toBe(200);
    expect((downloaded.body as Buffer).length).toBe(big.length);
  });

  it('leaves no temporary upload file behind when validation fails', async () => {
    const { writerCookie } = await setupTender();
    const before = await countTmpFiles();

    // مناقصة غير موجودة → يفشل بعد استلام الملف
    const res = await request(app)
      .post('/v1/tenders/does-not-exist/attachments')
      .set('Cookie', writerCookie)
      .attach('file', Buffer.from('hello'), 'x.pdf');

    expect(res.status).toBe(404);
    expect(await countTmpFiles()).toBe(before);
  });

  it('exposes a read stream from storage rather than a full buffer', async () => {
    await storage.save('stream-test/a.txt', Buffer.from('hello stream'));
    const stream = storage.createReadStream('stream-test/a.txt');
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello stream');
  });
});

async function countTmpFiles(): Promise<number> {
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = path.join(os.tmpdir(), 'tender-uploads');
  try {
    return (await fs.readdir(dir)).length;
  } catch {
    return 0;
  }
}
