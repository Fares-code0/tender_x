/**
 * H6.5 — شظايا `select` مشتركة.
 *
 * كانت هذه الأشكال مكرّرة حرفيًا في عدة معالجات، فأي تعديل (إضافة حقل مثلًا)
 * كان يستلزم تتبّعها يدويًا. تعريفها هنا مرة واحدة يجعل شكل الاستجابة موحّدًا.
 */

/** مستخدم مختصر يظهر داخل المناقصات (المسؤول/المنشئ/منفّذ التغيير) */
export const userBriefSelect = { select: { id: true, name: true, role: true } } as const;

/** رافع المرفق (بلا الدور — لا تعرضه واجهة المرفقات) */
export const uploaderSelect = { select: { id: true, name: true } } as const;

/** الحقول العامة للمستخدم في مسارات الإدارة */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

/** خيار مستخدم لعناصر الفلاتر */
export const userOptionSelect = { id: true, name: true, role: true } as const;
