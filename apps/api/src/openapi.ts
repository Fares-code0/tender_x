import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  createTenderSchema,
  updateTenderSchema,
  tenderListFiltersSchema,
  saveChecklistAnswersSchema,
  reviewDecisionSchema,
  assignWriterSchema,
  managerDecisionSchema,
  tenderResultSchema,
  createChecklistTemplateSchema,
  updateChecklistTemplateSchema,
  updateSettingsSchema,
  tenderStatusSchema,
  roleSchema,
} from '@tender/shared';
import { API_V1 } from './lib/apiVersion';

extendZodWithOpenApi(z);

/**
 * H6.4 — يُولَّد التوثيق من **مخططات Zod نفسها** التي تتحقق من الطلبات وقت التشغيل.
 * لذلك لا يمكن للتوثيق أن ينحرف عن السلوك الفعلي: تغيير قاعدة تحقق يغيّر المخطط فورًا.
 */
const registry = new OpenAPIRegistry();

const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('Error');

const cookieAuth = registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'token',
});

/** استجابات الأخطاء المشتركة (تُعاد بنفس الشكل من كل المسارات — `lib/errors.ts`) */
const commonErrors = {
  401: { description: 'غير مصادَق', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'ممنوع', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'غير موجود', content: { 'application/json': { schema: errorSchema } } },
  422: {
    description: 'بيانات غير صالحة',
    content: { 'application/json': { schema: errorSchema } },
  },
  429: {
    description: 'تجاوز حد المعدل (يتضمن Retry-After)',
    content: { 'application/json': { schema: errorSchema } },
  },
};

const json = (schema: z.ZodTypeAny) => ({ 'application/json': { schema } });

function post(path: string, tag: string, summary: string, body: z.ZodTypeAny, secured = true) {
  registry.registerPath({
    method: 'post',
    path: `${API_V1}${path}`,
    tags: [tag],
    summary,
    ...(secured ? { security: [{ [cookieAuth.name]: [] }] } : {}),
    request: { body: { content: json(body) } },
    responses: {
      200: { description: 'نجاح', content: json(z.object({}).passthrough()) },
      ...commonErrors,
    },
  });
}

function get(path: string, tag: string, summary: string, query?: z.ZodTypeAny) {
  registry.registerPath({
    method: 'get',
    path: `${API_V1}${path}`,
    tags: [tag],
    summary,
    security: [{ [cookieAuth.name]: [] }],
    ...(query ? { request: { query: query as never } } : {}),
    responses: {
      200: { description: 'نجاح', content: json(z.object({}).passthrough()) },
      ...commonErrors,
    },
  });
}

// ---- المصادقة ----
post('/auth/login', 'Auth', 'تسجيل الدخول (يضبط كوكي الجلسة)', loginSchema, false);
registry.registerPath({
  method: 'post',
  path: `${API_V1}/auth/logout`,
  tags: ['Auth'],
  summary: 'تسجيل الخروج (يُبطل التوكن فعليًا — H1.3)',
  security: [{ [cookieAuth.name]: [] }],
  responses: { 200: { description: 'تم' }, ...commonErrors },
});
get('/auth/me', 'Auth', 'المستخدم الحالي');

// ---- المناقصات ----
post('/tenders', 'Tenders', 'تسجيل مناقصة (QA)', createTenderSchema);
get('/tenders', 'Tenders', 'قائمة المناقصات (فلاتر + ترقيم)', tenderListFiltersSchema);
get('/tenders/{id}', 'Tenders', 'تفاصيل المناقصة مع تاريخ الحالات');
registry.registerPath({
  method: 'patch',
  path: `${API_V1}/tenders/{id}`,
  tags: ['Tenders'],
  summary: 'تعديل بيانات المناقصة (تُقفَل بعد التقديم — ACT-02)',
  security: [{ [cookieAuth.name]: [] }],
  request: { body: { content: json(updateTenderSchema) } },
  responses: { 200: { description: 'تم' }, ...commonErrors },
});
get('/tenders/meta/writers', 'Tenders', 'الكتّاب النشطون للتعيين');

// ---- المراجعة ----
post('/tenders/{id}/review/start', 'Review', 'بدء المراجعة (QA)', z.object({}));
get('/tenders/{id}/checklist', 'Review', 'بنود قالب المراجعة مع الإجابات');
registry.registerPath({
  method: 'put',
  path: `${API_V1}/tenders/{id}/checklist`,
  tags: ['Review'],
  summary: 'حفظ إجابات قائمة المراجعة (QA)',
  security: [{ [cookieAuth.name]: [] }],
  request: { body: { content: json(saveChecklistAnswersSchema) } },
  responses: { 200: { description: 'تم' }, ...commonErrors },
});
post('/tenders/{id}/review/decision', 'Review', 'قرار المراجعة (BR-001/BR-002)', reviewDecisionSchema);

// ---- سير العمل ----
post('/tenders/{id}/assign', 'Workflow', 'تعيين كاتب (BR-001/BR-003)', assignWriterSchema);
post('/tenders/{id}/submit-for-approval', 'Workflow', 'إرسال للاعتماد (الكاتب المعيّن)', z.object({}));
post('/tenders/{id}/manager-decision', 'Workflow', 'قرار المدير (BR-011)', managerDecisionSchema);
post('/tenders/{id}/mark-submitted', 'Workflow', 'تسجيل التقديم (BR-004)', z.object({}));
post('/tenders/{id}/result', 'Workflow', 'تسجيل النتيجة (BR-005)', tenderResultSchema);

// ---- المرفقات وسجل التدقيق ----
get('/tenders/{id}/attachments', 'Attachments', 'قائمة مرفقات المناقصة');
get('/attachments/{id}/download', 'Attachments', 'تنزيل مرفق (مقيَّد بالتفويض — H1.1)');
get('/tenders/{id}/audit', 'Audit', 'سجل عمليات المناقصة (مرقّم، قراءة فقط)');

// ---- الإدارة والإعدادات ----
get('/admin/users', 'Admin', 'قائمة المستخدمين (مرقّمة)');
post('/admin/users', 'Admin', 'إنشاء مستخدم', createUserSchema);
registry.registerPath({
  method: 'patch',
  path: `${API_V1}/admin/users/{id}`,
  tags: ['Admin'],
  summary: 'تعديل مستخدم',
  security: [{ [cookieAuth.name]: [] }],
  request: { body: { content: json(updateUserSchema) } },
  responses: { 200: { description: 'تم' }, ...commonErrors },
});
get('/admin/settings', 'Admin', 'قراءة إعدادات النظام');
registry.registerPath({
  method: 'patch',
  path: `${API_V1}/admin/settings`,
  tags: ['Admin'],
  summary: 'تعديل إعدادات النظام (BR-009)',
  security: [{ [cookieAuth.name]: [] }],
  request: { body: { content: json(updateSettingsSchema) } },
  responses: { 200: { description: 'تم' }, ...commonErrors },
});

// ---- قوالب المراجعة ----
get('/checklist-templates', 'Checklists', 'قائمة القوالب');
post('/checklist-templates', 'Checklists', 'إنشاء قالب', createChecklistTemplateSchema);
registry.registerPath({
  method: 'patch',
  path: `${API_V1}/checklist-templates/{id}`,
  tags: ['Checklists'],
  summary: 'تعديل قالب',
  security: [{ [cookieAuth.name]: [] }],
  request: { body: { content: json(updateChecklistTemplateSchema) } },
  responses: { 200: { description: 'تم' }, ...commonErrors },
});

// ---- الإشعارات والتقارير ----
get('/notifications', 'Notifications', 'إشعارات المستخدم + عدّاد غير المقروء');
post('/notifications/{id}/read', 'Notifications', 'تعليم إشعار كمقروء', z.object({}));
get('/dashboard', 'Reports', 'لوحة المعلومات حسب الدور');
get('/reports/summary', 'Reports', 'تقرير ملخّص (فترة + أداء المستخدمين)');
get('/users', 'Users', 'قائمة مختصرة بالمستخدمين لعناصر الفلاتر');

// أنواع مشتركة تظهر في المخطط
registry.register('TenderStatus', tenderStatusSchema.openapi('TenderStatus'));
registry.register('Role', roleSchema.openapi('Role'));

/** يبني وثيقة OpenAPI 3 من السجل أعلاه. */
export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Tender Management API',
      version: '1.0.0',
      description:
        'واجهة نظام إدارة المناقصات. المخطط مُولَّد من مخططات Zod المستخدمة في التحقق وقت التشغيل، ' +
        'وفحوص البنية (`/health`, `/livez`, `/readyz`, `/metrics`) خارج النسخنة عمدًا.',
    },
    servers: [{ url: '/' }],
  });
}
