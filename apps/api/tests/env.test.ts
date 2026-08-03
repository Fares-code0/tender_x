import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/lib/env';

// مصدر بيئة إنتاجي صالح كأساس للحالات
const prodBase: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a-sufficiently-long-random-secret',
  NODE_ENV: 'production',
};

describe('parseEnv (H0.1 — strict env validation)', () => {
  it('parses a valid production env and applies defaults', () => {
    const env = parseEnv(prodBase);
    expect(env.jwtSecret).toBe(prodBase.JWT_SECRET);
    expect(env.nodeEnv).toBe('production');
    expect(env.jwtExpiresIn).toBe('7d');
    expect(env.port).toBe(4000);
    expect(env.trustProxyHops).toBe(1);
  });

  it('throws when JWT_SECRET is missing', () => {
    const { JWT_SECRET, ...rest } = prodBase;
    void JWT_SECRET;
    expect(() => parseEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = prodBase;
    void DATABASE_URL;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects the known default/weak JWT_SECRET in production', () => {
    expect(() => parseEnv({ ...prodBase, JWT_SECRET: 'change-me-in-production' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() =>
      parseEnv({ ...prodBase, JWT_SECRET: 'dev-secret-do-not-use-in-production' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects a too-short JWT_SECRET in production', () => {
    expect(() => parseEnv({ ...prodBase, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('allows a weak/short secret outside production (dev/test convenience)', () => {
    const env = parseEnv({ ...prodBase, NODE_ENV: 'development', JWT_SECRET: 'change-me-in-production' });
    expect(env.nodeEnv).toBe('development');
    expect(env.jwtSecret).toBe('change-me-in-production');
  });

  it('parses TRUST_PROXY as a number', () => {
    const env = parseEnv({ ...prodBase, TRUST_PROXY: '2' });
    expect(env.trustProxyHops).toBe(2);
  });

  // S5 — التوثيق كان مكشوفًا افتراضيًا: `render.yaml` يطفئه صراحةً بينما
  // `docker-compose.prod.yml` لا يذكره، فالنشر الذاتي ينشر ٢٧ مسارًا بأشكال
  // طلباتها لأي زائر. الافتراض الآمن يجعل النسيان بلا أثر.
  it('keeps /docs and /openapi.json off unless explicitly enabled', () => {
    expect(parseEnv(prodBase).docsEnabled).toBe(false);
    expect(parseEnv({ ...prodBase, NODE_ENV: 'development' }).docsEnabled).toBe(false);
  });

  it('enables docs only on an explicit opt-in', () => {
    expect(parseEnv({ ...prodBase, DOCS_ENABLED: 'true' }).docsEnabled).toBe(true);
    expect(parseEnv({ ...prodBase, DOCS_ENABLED: 'false' }).docsEnabled).toBe(false);
  });
});
