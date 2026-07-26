import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createApp } from '../src/app';
import { createMetrics } from '../src/lib/metrics';
import { resetDb, createUser, TEST_PASSWORD } from './helpers/db';

/** يلتقط أسطر السجل المكتوبة فعليًا حتى نتحقق من بنيتها JSON */
function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const logger = pino(
    {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'password',
          '*.password',
        ],
        censor: '[REDACTED]',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    stream,
  );
  const entries = () =>
    lines
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { logger, entries, raw: () => lines.join('') };
}

describe('Structured request logging (H3.1)', () => {
  it('emits one structured JSON line per request with method, url and status', async () => {
    const { logger, entries } = captureLogger();
    const app = createApp({ logger });

    await request(app).get('/livez');

    const reqLogs = entries().filter((e) => e.req !== undefined);
    expect(reqLogs.length).toBe(1);

    const entry = reqLogs[0];
    const req = entry.req as Record<string, unknown>;
    const res = entry.res as Record<string, unknown>;
    expect(req.method).toBe('GET');
    expect(req.url).toBe('/livez');
    expect(res.statusCode).toBe(200);
    // حقول التسجيل المنظّم الأساسية
    expect(entry.level).toBe('info');
    expect(entry.time).toBeTruthy();
    expect(entry.responseTime).toBeTypeOf('number');
  });

  it('logs 4xx as warn and 5xx-free 404s are still structured', async () => {
    const { logger, entries } = captureLogger();
    const app = createApp({ logger });

    await request(app).get('/definitely-not-a-route');

    const entry = entries().find((e) => e.req !== undefined)!;
    expect((entry.res as Record<string, unknown>).statusCode).toBe(404);
    expect(entry.level).toBe('warn');
  });

  it('never leaks the session cookie or password into the logs', async () => {
    const { logger, raw } = captureLogger();
    const app = createApp({ logger });
    await resetDb();
    const user = await createUser('QA');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    // أعد استخدام الكوكي في طلب لاحق حتى تمرّ ترويسة Cookie عبر المسجّل
    const cookie = login.headers['set-cookie'];
    await request(app)
      .get('/auth/me')
      .set('Cookie', Array.isArray(cookie) ? cookie.join('; ') : String(cookie));

    const output = raw();
    expect(output).not.toContain(TEST_PASSWORD);
    // قيمة توكن الجلسة لا تظهر نصًّا في السجل
    expect(output).not.toMatch(/token=[A-Za-z0-9._-]{20,}/);
    expect(output).toContain('[REDACTED]');
  });
});

describe('Correlation / request IDs (H3.2)', () => {
  it('generates an x-request-id and returns it to the client', async () => {
    const { logger, entries } = captureLogger();
    const app = createApp({ logger });

    const res = await request(app).get('/livez');

    const header = res.headers['x-request-id'];
    expect(header).toBeTruthy();

    // نفس المعرّف يظهر في سطر السجل الخاص بالطلب (pino-http يضعه في req.id)
    const entry = entries().find((e) => e.req !== undefined)!;
    expect((entry.req as Record<string, unknown>).id).toBe(header);
  });

  it('honours an incoming x-request-id so a trace spans services', async () => {
    const { logger, entries } = captureLogger();
    const app = createApp({ logger });
    const incoming = 'trace-abc-123';

    const res = await request(app).get('/livez').set('x-request-id', incoming);

    expect(res.headers['x-request-id']).toBe(incoming);
    const entry = entries().find((e) => e.req !== undefined)!;
    expect((entry.req as Record<string, unknown>).id).toBe(incoming);
  });

  it('gives different requests different ids', async () => {
    const { logger } = captureLogger();
    const app = createApp({ logger });

    const a = await request(app).get('/livez');
    const b = await request(app).get('/livez');

    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('Prometheus metrics (H3.3)', () => {
  let metrics: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    metrics = createMetrics();
  });

  it('exposes /metrics in Prometheus text format with default process metrics', async () => {
    const app = createApp({ metrics });

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // مقاييس العملية الافتراضية
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
  });

  it('counts requests with method/route/status labels (RED)', async () => {
    const app = createApp({ metrics });

    await request(app).get('/livez');
    await request(app).get('/livez');

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toMatch(
      /http_requests_total\{method="GET",route="\/livez",status="200"\}\s+2/,
    );
  });

  it('records request duration in a histogram', async () => {
    const app = createApp({ metrics });

    await request(app).get('/livez');

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/livez"[^}]*\}\s+1/);
  });

  it('groups unmatched routes under one label to bound cardinality', async () => {
    const app = createApp({ metrics });

    await request(app).get('/nope-1');
    await request(app).get('/nope-2');

    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/route="__unmatched__"[^\n]*\s+2/);
    expect(res.text).not.toContain('route="/nope-1"');
  });

  it('is not blocked by the global rate limiter', async () => {
    const app = createApp({ metrics, rateLimit: true, globalLimit: 1, globalWindowMs: 60_000 });

    await request(app).get('/livez');
    // استهلك الحد العام
    await request(app).get('/tenders');
    expect((await request(app).get('/tenders')).status).toBe(429);

    // الكاشط يجب أن يظل قادرًا على السحب
    expect((await request(app).get('/metrics')).status).toBe(200);
  });
});
