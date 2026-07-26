import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
  type Registry as RegistryType,
} from 'prom-client';

/**
 * H3.3 — مقاييس Prometheus (نمط RED: Rate / Errors / Duration).
 *
 * نستخدم سجلًّا (Registry) مستقلًا لا السجل العام، حتى تُنشأ نسخة نظيفة لكل
 * تطبيق في الاختبارات بلا تضارب "مقياس مسجَّل مسبقًا".
 */
export interface Metrics {
  registry: RegistryType;
  httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  // مقاييس العملية الافتراضية (ذاكرة، CPU، event loop…)
  collectDefaultMetrics({ register: registry });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'إجمالي طلبات HTTP مقسّمة حسب الطريقة والمسار وحالة الاستجابة',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'زمن معالجة طلبات HTTP بالثواني',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  return { registry, httpRequestsTotal, httpRequestDuration };
}

/**
 * يُطبّع المسار إلى قالب المسار (`/tenders/:id`) بدل القيمة الفعلية،
 * وإلا انفجر عدد السلاسل الزمنية (cardinality) بمعرّف لكل مناقصة.
 */
export function routeLabel(req: {
  route?: { path?: string };
  baseUrl?: string;
  path: string;
}): string {
  if (req.route?.path) {
    const base = req.baseUrl ?? '';
    const full = `${base}${req.route.path}`;
    return full.replace(/\/$/, '') || '/';
  }
  // مسار غير مطابق لأي راوتر (404) — نجمعه تحت تسمية واحدة
  return '__unmatched__';
}
