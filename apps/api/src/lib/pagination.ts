import { z } from 'zod';

/**
 * H4.3 — ترقيم موحّد للقوائم التي قد تنمو بلا حد.
 * `max(100)` يمنع طلب صفحة ضخمة تُسقط الخادم؛ نفس اصطلاح قائمة المناقصات.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** ينشئ مخطط ترقيم بحجم صفحة افتراضي مختلف مع بقاء نفس الحد الأقصى. */
export function makePaginationSchema(defaultPageSize: number = DEFAULT_PAGE_SIZE) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(defaultPageSize),
  });
}

export const paginationSchema = makePaginationSchema();

/**
 * قوائم مرجعية صغيرة (المستخدمون لعناصر الفلاتر): نرفع الافتراضي إلى الحد الأقصى
 * حتى تبقى القائمة كاملة للمؤسسات الصغيرة، مع إبقاء سقف يمنع الاستعلام غير المحدود.
 * الاستجابة تتضمن `total` فيستطيع العميل كشف الاقتطاع.
 */
export const referencePaginationSchema = makePaginationSchema(MAX_PAGE_SIZE);

export type Pagination = z.infer<typeof paginationSchema>;

/** يحوّل الصفحة إلى `skip`/`take` لـPrisma. */
export function toSkipTake(p: Pagination): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}
