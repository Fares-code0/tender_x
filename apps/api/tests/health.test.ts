import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /ping (shared zod schema)', () => {
  it('accepts valid payload', async () => {
    const res = await request(createApp()).post('/ping').send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: 'hello' });
  });

  it('rejects invalid payload', async () => {
    const res = await request(createApp()).post('/ping').send({});
    expect(res.status).toBe(422);
  });
});
