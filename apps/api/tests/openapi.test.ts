import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { buildOpenApiDocument } from '../src/openapi';
import { API_V1 } from '../src/lib/apiVersion';

const app = createApp();

describe('OpenAPI schema generated from Zod (H6.4)', () => {
  it('serves a valid OpenAPI 3 document at /openapi.json', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBeTruthy();
    expect(Object.keys(res.body.paths ?? {}).length).toBeGreaterThan(10);
  });

  it('documents paths under the versioned prefix', async () => {
    const doc = buildOpenApiDocument();
    const paths = Object.keys(doc.paths ?? {});

    expect(paths).toContain(`${API_V1}/tenders`);
    expect(paths).toContain(`${API_V1}/auth/login`);
    // لا مسار عمل موثّق بلا نسخة
    expect(paths.every((p) => p.startsWith(API_V1))).toBe(true);
  });

  /**
   * الفائدة الحقيقية من التوليد: المخطط مشتقّ من قواعد التحقق الفعلية،
   * فلو تغيّرت قاعدة في Zod تغيّر التوثيق معها تلقائيًا.
   */
  it('derives request bodies from the real Zod validation rules', async () => {
    const doc = buildOpenApiDocument();
    const login = doc.paths?.[`${API_V1}/auth/login`]?.post;
    // `requestBody` قد يكون مرجعًا ($ref) في OpenAPI؛ هنا نعرف أنه مضمَّن
    const body = login?.requestBody as { content?: Record<string, { schema?: unknown }> };
    const schema = body?.content?.['application/json']?.schema;

    expect(schema).toBeTruthy();
    const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['email', 'password']));
    // قاعدة البريد الإلكتروني جاءت من `loginSchema` لا من كتابة يدوية
    expect((props.email as { format?: string }).format).toBe('email');
  });

  it('declares the cookie session security scheme', async () => {
    const doc = buildOpenApiDocument();
    const schemes = doc.components?.securitySchemes ?? {};
    expect(schemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'token' });
  });

  it('serves the Swagger UI page at /docs', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('does not block the docs page with a restrictive CSP', async () => {
    // helmet الافتراضي يمنع السكربتات المضمّنة، وSwagger UI يحتاجها ⇒ صفحة بيضاء بصمت
    const res = await request(app).get('/docs/');
    const csp = res.headers['content-security-policy'];
    if (csp) {
      expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    }
  });
});
