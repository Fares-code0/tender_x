import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// H0.2 — trust proxy مضبوط على عدد قفزات محدّد (ليس true)
describe('trust proxy (H0.2)', () => {
  it('is configured to a numeric hop count', () => {
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });
});

// H0.4 — فحوص الحياة/الجاهزية
describe('liveness & readiness (H0.4)', () => {
  it('GET /livez returns 200 live', async () => {
    const res = await request(createApp()).get('/livez');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'live' });
  });

  it('GET /readyz returns 200 ready when the DB is reachable', async () => {
    const res = await request(createApp()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('GET /readyz returns 503 unready when the DB check fails', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('db down'));
    const res = await request(createApp()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unready' });
    spy.mockRestore();
  });
});

// H0.5 — /ping خلف حارس non-prod؛ في بيئة الاختبار (non-prod) لا يزال متاحًا
describe('POST /ping (non-prod debug endpoint — H0.5)', () => {
  it('accepts valid payload outside production', async () => {
    const res = await request(createApp()).post('/ping').send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: 'hello' });
  });

  it('rejects invalid payload', async () => {
    const res = await request(createApp()).post('/ping').send({});
    expect(res.status).toBe(422);
  });
});
