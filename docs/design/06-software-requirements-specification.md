# 06 — مواصفة متطلبات البرمجيات (Software Requirements Specification — SRS)

<div dir="rtl">

> **الإصدار:** 1.0 · **التاريخ:** 2026-07-23 · **الحالة:** يعكس التنفيذ الفعلي حتى v1.0 + تحسينات ما بعد الإصدار.
> **المنهجية:** كل متطلب هنا **مستخرَج من التنفيذ الفعلي** في الكود ومن حزمة التصميم (`01`…`05`). لم تُخترَع متطلبات؛ وما هو غير منفّذ مذكور صراحةً في [الملحق ب](#الملحق-ب--القيود-وما-هو-غير-منفَّذ). البنية العامة تتبع نمط IEEE 830 مُكيَّفًا.

---

## 1. المقدمة (Introduction)

### 1.1 الغرض (Purpose)
يوثّق هذا المستند **المتطلبات الوظيفية وغير الوظيفية** لنظام إدارة المناقصات الذكي (Smart Tender Management System)، ليكون مرجعًا موحّدًا للفريق التقني وأصحاب المصلحة وفريق الجودة. كل متطلب مربوط بمصدره في الكود وبقواعد العمل (`BR`)، والإجراءات (`ACT`)، والشاشات (`SCR`)، والرحلات (`JRN`)، وحالات القبول (`UAT`).

### 1.2 النطاق (Scope)
نظام ويب **داخلي** لإدارة دورة حياة المناقصة كاملة: الاكتشاف/التسجيل ← مراجعة الجودة بقائمة تحقق ← إعداد العرض ← اعتماد المدير ← التقديم ← تسجيل النتيجة (فوز/خسارة)، مع مرفقات، إشعارات، لوحات معلومات، تقارير وتصدير CSV، سجل عمليات (Audit)، إدارة مستخدمين، وإعدادات نظام. النظام مُصمَّم لنسخة داخلية خلف بروكسي موثوق.

**خارج النطاق:** تسجيل ذاتي، إعادة تعيين كلمة المرور، إشعارات بريدية، تكامل خارجي مع منصّات المناقصات، تعدّد المستأجرين (multi-tenancy).

### 1.3 التعريفات والاختصارات (Definitions & Abbreviations)

| المصطلح | المعنى |
|---|---|
| RBAC | التحكم بالوصول المبني على الأدوار |
| State Machine | آلة الحالات المركزية لدورة حياة المناقصة (`services/tenderWorkflow.ts`) |
| Audit / سجل العمليات | سجل غير قابل للتعديل لكل إجراء جوهري (`AuditLog`) |
| Checklist | قائمة تحقق المراجعة القابلة للقولبة |
| `FR` / `NFR` | متطلب وظيفي / غير وظيفي |
| JWT | رمز مصادقة موقّع يُخزَّن في كوكي httpOnly |
| BR/ACT/SCR/JRN/UAT | معرّفات حزمة التصميم (قاعدة عمل/إجراء/شاشة/رحلة/حالة قبول) |

### 1.4 المراجع (References)
- [01 — كتالوج قواعد العمل](./01-business-rules-catalogue.md) · [02 — مصفوفة الأدوار](./02-roles-permissions-matrix.md) · [03 — رحلات المستخدمين](./03-user-journeys.md) · [04 — جرد الشاشات](./04-screen-inventory-and-specs.md) · [05 — خطة UAT](./05-user-acceptance-testing-plan.md)
- الكود المصدري المرجعي: `apps/api/src/**`, `apps/web/src/**`, `packages/shared/src/**`, `apps/api/prisma/schema.prisma`.
- المصدر الأصلي للمواصفة: `CLAUDE_CODE_PROMPT_Tender_System.md`.

### 1.5 نظرة عامة على المستند (Overview)
القسم 2 يصف النظام كليًا؛ القسم 3 واجهات النظام الخارجية؛ القسم 4 المتطلبات الوظيفية (`FR`)؛ القسم 5 المتطلبات غير الوظيفية (`NFR`)؛ القسم 6 نموذج البيانات؛ القسم 7 متطلبات دورة الحياة؛ والملاحق التتبّع والقيود.

---

## 2. الوصف العام (Overall Description)

### 2.1 منظور المنتج (Product Perspective)
نظام **Monorepo** مستقل يُدار بـpnpm، من ثلاث حزم:
- `apps/api` — خادم REST (Express + TypeScript + Prisma).
- `apps/web` — واجهة أحادية الصفحة (React + Vite + Tailwind RTL).
- `packages/shared` — مخططات Zod مشتركة بين الطرفين (مصدر تحقّق واحد).

```
[متصفح المستخدم] ⇄ HTTPS ⇄ [apps/web (Vite/React)]
                                   │ (proxy /api)
                                   ▼
                           [apps/api (Express REST)] ⇄ [PostgreSQL 16 (Prisma)]
                                   │                         
                                   ├─ StorageService (قرص محلي؛ قابل للاستبدال بـS3)
                                   └─ node-cron (مهمة تنبيه الإغلاق)
```

### 2.2 وظائف المنتج (Product Functions — ملخّص)
مصادقة وإدارة جلسات · تسجيل/تعديل/عرض المناقصات · مراجعة جودة بقائمة تحقق · دورة حياة عبر State Machine مركزية · اعتماد المدير والنتيجة · قوالب Checklist · مرفقات مع versioning · إشعارات داخلية · لوحات معلومات ورسوم · تقارير وتصدير CSV · سجل عمليات للقراءة فقط · إدارة مستخدمين وأدوار · إعدادات نظام · مهمة تنبيه إغلاق مجدولة.

### 2.3 فئات المستخدمين والأدوار (User Classes & Roles)

| الدور (Enum) | التسمية | الصلاحية الجوهرية |
|---|---|---|
| `QA` | مراجع الجودة | تسجيل المناقصة، الـChecklist، التحويل/الاستبعاد المبكر |
| `WRITER` | كاتب العروض | المرفقات، إرسال العرض للاعتماد (المعيّن فقط) |
| `MANAGER` | المدير | اعتماد/إعادة/إيقاف، تسجيل التقديم والنتيجة، تعديل بيانات المناقصة |
| `OWNER` | المالك | اطّلاع/قراءة + تقارير فقط |
| `ADMIN` | مسؤول النظام | إدارة المستخدمين، الإعدادات، تعديل بيانات المناقصة |

المرجع التفصيلي: [02 — مصفوفة الأدوار والصلاحيات](./02-roles-permissions-matrix.md).

### 2.4 بيئة التشغيل (Operating Environment)
- **الخادم:** Node.js ≥ 20، Express 4، Prisma 6، PostgreSQL 16.
- **الواجهة:** متصفح حديث يدعم ES2020+ (React 18 + Vite).
- **التخزين:** قرص محلي عبر `StorageService` (مجرّد لاستبدال مستقبلي بـS3).
- **النشر المستهدف:** نسخة داخلية واحدة خلف بروكسي/موازِن حمل موثوق.

### 2.5 قيود التصميم والتنفيذ (Design & Implementation Constraints)
- كل تحقّق مدخلات يمرّ عبر Zod من `@tender/shared` (مصدر واحد للطرفين).
- **كل** تغييرات حالة المناقصة تمرّ حصريًا عبر `resolveTransition` + `recordStatusChange` (State Machine + معاملة ذرّية).
- شكل خطأ موحّد `{ error: { code, message, details? } }`.
- الأمان: JWT في httpOnly cookie، bcrypt، Helmet، CORS مضبوط، rate-limit على الدخول.

### 2.6 الافتراضات والاعتماديات (Assumptions & Dependencies)
- تشغيل خلف بروكسي موثوق ينهي TLS (`secure` cookie في الإنتاج).
- توفّر PostgreSQL 16 مع `DATABASE_URL` صحيح.
- ضبط `JWT_SECRET` سرّي في الإنتاج (**انظر NFR-001 والقيود**).
- «كل مستخدم داخلي يقرأ كل المناقصات» سياسة معتمدة (قراءة التفاصيل/تحميل المرفقات لأي مصادَق).

---

## 3. متطلبات الواجهات الخارجية (External Interface Requirements)

### 3.1 واجهات المستخدم (User Interfaces)
تسع شاشات موثّقة في [04](./04-screen-inventory-and-specs.md): `SCR-01` تسجيل الدخول · `SCR-02` لوحة المعلومات · `SCR-03` قائمة المناقصات · `SCR-04` تفاصيل المناقصة (تبويبات: التفاصيل/المراجعة/المرفقات/سجل العمليات + شريط إجراءات + جرس إشعارات) · `SCR-05` نموذج المناقصة · `SCR-06` إدارة المستخدمين · `SCR-07` مهامي · `SCR-08` التقارير · `SCR-09` الإعدادات. الواجهة **RTL عربية** بالكامل مع حالات تحميل/فراغ/خطأ في كل صفحة.

### 3.2 واجهات البرمجيات (Software Interfaces)
- **قاعدة البيانات:** PostgreSQL 16 عبر Prisma Client (استعلامات مُعامَلة — parameterized).
- **التخزين:** واجهة `StorageService { save, read, delete }` (`services/storage.ts`).
- **الجدولة:** `node-cron` (تعبير `0 8 * * *`).

### 3.3 واجهات الاتصال (Communication Interfaces — REST API)
- بروتوكول: HTTP/JSON فوق `/api` (proxy الواجهة → الخادم على `:4000`).
- المصادقة: كوكي `token` (JWT، httpOnly، `SameSite=Lax`، `Secure` في الإنتاج).
- شكل الخطأ الموحّد: `{ "error": { "code": string, "message": string, "details"?: any } }`.
- CORS: مقصور على `WEB_ORIGIN` مع `credentials: true`.

**جرد نقاط النهاية (Endpoint Inventory):**

| المسار | الطريقة | الحارس | المرجع |
|---|---|---|---|
| `/auth/login` | POST | عام (+ rate-limit) | FR-AUTH-01 |
| `/auth/logout` | POST | عام | FR-AUTH-04 |
| `/auth/me` | GET | مصادَق | FR-AUTH-05 |
| `/tenders` | POST/GET | QA / مصادَق | FR-TEN-01/03 |
| `/tenders/:id` | GET/PATCH | مصادَق / QA·MANAGER·ADMIN | FR-TEN-04/05 |
| `/tenders/meta/writers` | GET | مصادَق | FR-TEN-06 |
| `/tenders/:id/review/start` | POST | QA | FR-REV-01 |
| `/tenders/:id/checklist` | GET/PUT | مصادَق / QA | FR-REV-02 |
| `/tenders/:id/review/decision` | POST | QA | FR-REV-03 |
| `/tenders/:id/assign` | POST | QA | FR-REV-04 |
| `/tenders/:id/submit-for-approval` | POST | WRITER (المعيّن) | FR-APR-01 |
| `/tenders/:id/manager-decision` | POST | MANAGER | FR-APR-02 |
| `/tenders/:id/mark-submitted` | POST | MANAGER | FR-APR-03 |
| `/tenders/:id/result` | POST | MANAGER | FR-APR-04 |
| `/tenders/:id/attachments` | POST/GET | WRITER / مصادَق | FR-ATT-01/02 |
| `/attachments/:id/download` | GET | مصادَق | FR-ATT-03 |
| `/tenders/:id/audit` | GET | MANAGER·OWNER·ADMIN | FR-AUD-01 |
| `/checklist-templates` | GET/POST | مصادَق / ADMIN·MANAGER | FR-CLT-01/02 |
| `/checklist-templates/:id` | PATCH | ADMIN·MANAGER | FR-CLT-03 |
| `/notifications` | GET | مصادَق | FR-NOT-01 |
| `/notifications/:id/read` | POST | مصادَق (صاحبها) | FR-NOT-02 |
| `/dashboard` | GET | مصادَق | FR-DASH-01 |
| `/reports/summary` | GET | MANAGER·OWNER·ADMIN | FR-REP-01 |
| `/users` | GET | مصادَق | FR-TEN-03 (فلتر) |
| `/admin/users` | GET/POST | ADMIN | FR-USR-01/02 |
| `/admin/users/:id` | PATCH | ADMIN | FR-USR-03 |
| `/admin/settings` | GET/PATCH | ADMIN | FR-SET-01/02 |
| `/health` | GET | عام | NFR-011 |
| `/ping` | POST | عام (تجريبي) | الملحق ب |

---

## 4. المتطلبات الوظيفية (Functional Requirements)

**اصطلاح:** كل متطلب `FR-<الوحدة>-<n>`، مع الدور، المصدر (endpoint · BR/ACT · ملف)، والأولوية (عالية/متوسطة/منخفضة). النتائج المتوقعة تفصيليًا في [05 — خطة UAT](./05-user-acceptance-testing-plan.md).

### 4.1 المصادقة والجلسات (Authentication)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-AUTH-01 | يجب أن يصادِق النظام المستخدم ببريد وكلمة مرور، ويُصدر JWT في كوكي httpOnly عند النجاح | الكل | `auth.ts:login` · bcrypt | عالية |
| FR-AUTH-02 | يجب رفض بيانات خاطئة بـ`401 INVALID_CREDENTIALS` وحساب معطّل بـ`403 ACCOUNT_DISABLED` | الكل | `auth.ts:26-29` | عالية |
| FR-AUTH-03 | يجب تحديد محاولات الدخول بـ5 محاولات/15 دقيقة ثم `429` (خارج بيئة الاختبار) | الكل | `app.ts:36` | عالية |
| FR-AUTH-04 | يجب أن يمسح تسجيل الخروج الكوكي بخيارات مطابقة | مصادَق | `auth.ts:logout` | متوسطة |
| FR-AUTH-05 | يجب أن يُرجع `/auth/me` المستخدم الحالي للجلسة الصالحة | مصادَق | `auth.ts:me` | عالية |
| FR-AUTH-06 | يجب أن يعيد حارس المصادقة جلب المستخدم من القاعدة والتحقق من `isActive` في **كل** طلب محمي (يرفض المعطّل/المحذوف بـ401) | مصادَق | `middleware/auth.ts:34-37` | عالية |
| FR-AUTH-07 | يجب أن يفرض `requireRole(...)` الأدوار على مستوى الخادم ويرفض غير المخوَّل بـ`403 FORBIDDEN` | الكل | `middleware/auth.ts:45` | عالية |

### 4.2 المناقصات — التسجيل والبيانات (Tenders Core)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-TEN-01 | يجب أن يُنشئ QA مناقصة بحقول إلزامية (العنوان، الجهة، موعد الإغلاق) بحالة `NEW`، مع قيد Audit وصف تاريخ حالة | QA | ACT-01·BR-010·`tenders.ts:59` | عالية |
| FR-TEN-02 | يجب أن يكشف النظام التكرار (نفس الرابط، أو نفس العنوان+الجهة) ويرفض بـ`409` قابلًا للتجاوز بـ`?force=1` | QA | `tenders.ts:64-82` | عالية |
| FR-TEN-03 | يجب أن يوفّر النظام قائمة مناقصات بفلاتر (الحالة/الجهة/المسؤول/نطاق الإغلاق/بحث حر)، وترتيب، وترقيم صفحات (`pageSize` 1..100، افتراضي 20) | مصادَق | `tenders.ts:127`·`tenderListFiltersSchema` | عالية |
| FR-TEN-04 | يجب أن يعرض تفاصيل مناقصة تشمل المسؤول والمنشئ وتاريخ الحالات مرتّبًا، و`404` لغير الموجود | مصادَق | `tenders.ts:191` | عالية |
| FR-TEN-05 | يجب أن يسمح بتعديل بيانات المناقصة لـQA/MANAGER/ADMIN فقط، مع **قفل التعديل** (`422 TENDER_LOCKED`) للحالات `SUBMITTED/WON/LOST/REJECTED` | QA·MANAGER·ADMIN | ACT-02·`isTenderEditable`·`tenders.ts:212` | عالية |
| FR-TEN-06 | يجب أن يوفّر قائمة الكتّاب النشطين لتغذية التعيين | مصادَق | `tenders.ts:177` | متوسطة |

### 4.3 مراجعة الجودة والـChecklist (QA Review)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-REV-01 | يجب أن يبدأ QA المراجعة بنقل المناقصة `NEW → UNDER_REVIEW` | QA | `REVIEW_START`·`tenders.ts:245` | عالية |
| FR-REV-02 | يجب أن يوفّر النظام جلب/حفظ إجابات الـChecklist (تأشير + ملاحظة لكل بند)، مع التحقق من وجود البنود | QA | ACT-04·`tenders.ts:269,295` | عالية |
| FR-REV-03 | يجب أن يمنع اعتماد المراجعة قبل اكتمال كل بنود القالب النشط (BR-001 → `422`)، ويتطلب سببًا إلزاميًا عند الاستبعاد (BR-002) | QA | BR-001/002·`tenders.ts:339` | عالية |
| FR-REV-04 | يجب أن يعيّن QA كاتبًا نشطًا فقط بعد اكتمال الـChecklist، ناقلًا `UNDER_REVIEW → PROPOSAL_PREPARATION` (BR-001+BR-003) ومُشعِرًا الكاتب | QA | ACT-05·`tenders.ts:389` | عالية |

### 4.4 الاعتماد ودورة الحياة (Approval & Result)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-APR-01 | يجب أن يُرسل **الكاتب المعيّن فقط** العرض للاعتماد (`PROPOSAL_PREPARATION → PENDING_APPROVAL`)، ويرفض غير المعيّن بـ`403 NOT_ASSIGNEE` | WRITER | ACT-07·`tenders.ts:434` | عالية |
| FR-APR-02 | يجب أن يقرّر المدير: **اعتماد** (يضبط `managerApprovedAt` دون تغيير الحالة)، أو **إعادة بملاحظات إلزامية** (BR-011 → `PROPOSAL_PREPARATION`)، أو **إيقاف بسبب إلزامي** (BR-002 → `REJECTED`) | MANAGER | ACT-08/09·`tenders.ts:472` | عالية |
| FR-APR-03 | يجب أن يمنع تسجيل التقديم قبل اعتماد المدير (BR-004 → `422 NOT_APPROVED`)، وإلا ينقل `PENDING_APPROVAL → SUBMITTED` | MANAGER | ACT-10·BR-004·`tenders.ts:560` | عالية |
| FR-APR-04 | يجب أن يسجّل المدير النتيجة (`WON`/`LOST`) من الحالة `SUBMITTED` فقط (BR-005)، مُشعِرًا منشئ المناقصة | MANAGER | ACT-11·BR-005·`tenders.ts:589` | عالية |
| FR-APR-05 | يجب أن ترفض الـState Machine أي انتقال غير معرَّف بـ`422 INVALID_TRANSITION` وأي انتقال بدور غير مسموح بـ`403 FORBIDDEN_TRANSITION` | الكل | `tenderWorkflow.ts:62` | عالية |

### 4.5 قوالب الـChecklist (Checklist Templates)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-CLT-01 | يجب أن يعرض النظام قوالب الـChecklist مع بنودها مرتّبة | مصادَق | `checklistTemplates.ts:17` | منخفضة |
| FR-CLT-02 | يجب أن يُنشئ ADMIN/MANAGER قالبًا ببند واحد على الأقل | ADMIN·MANAGER | `checklistTemplates.ts:30` | متوسطة |
| FR-CLT-03 | يجب أن يعدّل ADMIN/MANAGER القالب (اسم/تفعيل و/أو مصالحة بنود: تحديث/إنشاء/حذف) | ADMIN·MANAGER | `checklistTemplates.ts:56` | متوسطة |

### 4.6 المرفقات (Attachments)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-ATT-01 | يجب أن يرفع WRITER مرفقًا خلف `StorageService` بقيود النوع (`pdf/docx/xlsx/png/jpg/jpeg/zip`) والحجم (20MB `413`) وإصدار تلقائي (نفس الاسم → نسخة جديدة) مع قيد Audit | WRITER | ACT-13·`tenders.ts:625` | عالية |
| FR-ATT-02 | يجب أن يعرض قائمة مرفقات المناقصة (الاسم/الإصدار/الرافع/الحجم/التاريخ) | مصادَق | `tenders.ts:696` | متوسطة |
| FR-ATT-03 | يجب أن يتيح تحميل المرفق لأي مستخدم مصادَق باسم ملف صحيح UTF-8 | مصادَق | ACT-13·`attachments.ts:49` | عالية |

### 4.7 الإشعارات (Notifications)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-NOT-01 | يجب أن يعرض النظام آخر 50 إشعارًا للمستخدم + عدّاد غير المقروء | مصادَق | `notifications.ts:11` | متوسطة |
| FR-NOT-02 | يجب أن يعلّم المستخدم إشعاراته **هو فقط** كمقروءة (`404` لغيره) | مصادَق | `notifications.ts:28` | عالية |
| FR-NOT-03 | يجب أن يولّد النظام إشعارًا عند ستة أحداث سير عمل (إنشاء/تعيين/إرسال/إعادة/اعتماد/نتيجة) + تنبيه اقتراب الإغلاق | نظام | `services/notifications.ts` | متوسطة |

### 4.8 لوحة المعلومات والتقارير (Dashboard & Reports)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-DASH-01 | يجب أن توفّر لوحة معلومات محتوى حسب الدور + إحصائيات (توزيع الحالات، شهريًا)، مع حصر مؤشرات الأداء (نسبة الفوز، متوسط زمن المراحل) لـMANAGER/OWNER/ADMIN | مصادَق | ACT-15·`dashboard.ts` | متوسطة |
| FR-REP-01 | يجب أن يوفّر تقرير ملخّص (أعداد الحالات + فوز/خسارة + أداء كل مستخدم) بفلاتر `from/to/userId` لـMANAGER/OWNER/ADMIN فقط | MANAGER·OWNER·ADMIN | ACT-15·`reports.ts:19` | عالية |
| FR-REP-02 | يجب أن تتيح الواجهة تصدير التقرير CSV (بادئة BOM لدعم العربية في Excel) | MANAGER·OWNER·ADMIN | `ReportsPage.tsx`·SCR-08 | متوسطة |

### 4.9 سجل العمليات (Audit)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-AUD-01 | يجب أن يعرض النظام سجل عمليات المناقصة (من/ماذا/متى) لـMANAGER/OWNER/ADMIN فقط — **قراءة فقط** | MANAGER·OWNER·ADMIN | ACT-16·`tenders.ts:673` | عالية |
| FR-AUD-02 | يجب ألّا يوجد أي مسار حذف أو تعديل لسجل العمليات في أي راوتر (يفرض NFR-005) | — | NFR-005 | عالية |
| FR-AUD-03 | يجب تسجيل كل إجراء جوهري في Audit ضمن نفس المعاملة الذرّية لتغيير الحالة (BR-008) | نظام | `recordStatusChange`·`lib/audit.ts` | عالية |

### 4.10 إدارة المستخدمين والإعدادات (Administration)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-USR-01 | يجب أن يعرض ADMIN قائمة المستخدمين **دون** حقل كلمة المرور المُجزّأة | ADMIN | `adminUsers.ts:15` | عالية |
| FR-USR-02 | يجب أن يُنشئ ADMIN مستخدمًا ببريد فريد (`409` عند التكرار) وكلمة مرور ≥8 أحرف، مع قيد Audit | ADMIN | ACT-12·`adminUsers.ts:24` | عالية |
| FR-USR-03 | يجب أن يعدّل ADMIN الاسم/الدور/حالة التفعيل/كلمة المرور لمستخدم، مع قيد Audit | ADMIN | `adminUsers.ts:45` | عالية |
| FR-SET-01 | يجب أن يقرأ ADMIN إعداد `closingReminderDays` (افتراضي 3) | ADMIN | ACT-17·`settings.ts:13` | متوسطة |
| FR-SET-02 | يجب أن يعدّل ADMIN `closingReminderDays` (عدد صحيح 1..60، وإلا `422`)، ويقرؤه الـcron حيًّا | ADMIN | BR-009·`settings.ts:23` | عالية |

### 4.11 مهمة تنبيه الإغلاق المجدولة (Scheduled Job)

| المعرّف | المتطلب | الدور | المصدر | الأولوية |
|---|---|---|---|---|
| FR-JOB-01 | يجب أن تُنشئ مهمة مجدولة (يوميًا 08:00) إشعار `CLOSING_SOON` لكل مناقصة نشطة يقترب إغلاقها خلال `closingReminderDays`، **دون تكرار** لنفس المناقصة، للمسؤول (أو المنشئ) | نظام | BR-009·`closingReminder.ts`·`index.ts:13` | عالية |

---

## 5. المتطلبات غير الوظيفية (Non-Functional Requirements)

| المعرّف | الفئة | المتطلب | المصدر / الحالة |
|---|---|---|---|
| NFR-001 | الأمان | مصادقة JWT في كوكي httpOnly، كلمات المرور بـbcrypt (cost=10)، رؤوس Helmet، CORS مقصور على `WEB_ORIGIN`، rate-limit على الدخول | `app.ts`, `auth.ts`, `adminUsers.ts:29` |
| NFR-002 | التفويض | فرض RBAC على مستوى الخادم لكل مسار حسّاس عبر `requireRole` (لا اعتماد على الواجهة) | `middleware/auth.ts` |
| NFR-003 | صحّة المدخلات | تحقّق كل المدخلات عبر Zod من مصدر مشترك واحد للطرفين | `packages/shared` |
| NFR-004 | معالجة الأخطاء | شكل خطأ موحّد `{error:{code,message,details?}}` برسائل عربية، وعدم كشف تفاصيل داخلية في `500` | `lib/errors.ts` |
| NFR-005 | قابلية التدقيق (Immutability) | **سجل العمليات للقراءة فقط** — لا يوجد أي مسار حذف/تعديل للـAudit في أي راوتر | (يفرضه FR-AUD-02) |
| NFR-006 | الأداء والتوسّع | ترقيم صفحات على قائمة المناقصات (`take/skip`) وحدّ إشعارات (50)؛ فهارس على الحقول المستعلَمة | `schema.prisma @@index`، `tenders.ts` |
| NFR-007 | قابلية الاستخدام | واجهة RTL عربية كاملة مع حالات تحميل/فراغ/خطأ ورسائل تحقّق حقلية في كل شاشة | `apps/web` · [04](./04-screen-inventory-and-specs.md) |
| NFR-008 | قابلية الصيانة | Monorepo، مخططات مشتركة، State Machine مركزية كمصدر وحيد لتغيير الحالة، فحص أنواع TypeScript | `pnpm`, `tenderWorkflow.ts` |
| NFR-009 | قابلية النقل | Node ≥ 20، PostgreSQL 16، تجريد التخزين للاستبدال بـS3 دون تغيير المستدعيات | `storage.ts`, `pnpm-workspace.yaml` |
| NFR-010 | التتبّع | ربط كل متطلب/شاشة/رحلة بمعرّفات موحّدة (BR/ACT/SCR/JRN/FR/UAT) | حزمة `docs/design` |
| NFR-011 | التوفّر / الجاهزية | نقطة `/health` تُرجع حالة أساسية (**قيد:** لا تفحص القاعدة؛ لا `/readyz`) | `app.ts:31` · الملحق ب |
| NFR-012 | تكامل البيانات | تنفيذ تغيير الحالة + تاريخ الحالة + قيد Audit في **معاملة واحدة** ذرّية؛ حذف تعاقبي عبر مفاتيح أجنبية | `statusChange.ts`, `schema.prisma onDelete:Cascade` |
| NFR-013 | التوطين | كل نصوص الواجهة والرسائل بالعربية؛ دعم أسماء ملفات عربية UTF-8 | `labels.ts`, `tenders.ts:635` |

**متغيرات البيئة (Configuration):** `DATABASE_URL` · `JWT_SECRET` · `JWT_EXPIRES_IN` (افتراضي `7d`) · `PORT` (افتراضي `4000`) · `WEB_ORIGIN` (افتراضي `http://localhost:5173`) · `UPLOADS_DIR` (اختياري).

---

## 6. نموذج البيانات (Data Model)

المصدر: `apps/api/prisma/schema.prisma` (PostgreSQL 16، معرّفات `cuid`).

### 6.1 الكيانات (Entities)

| الكيان | الحقول الرئيسية | العلاقات / الفهارس |
|---|---|---|
| `User` | `id, name, email (فريد), passwordHash, role, isActive, createdAt, updatedAt` | ينشئ/يُسنَد إليه مناقصات، إشعارات، قيود Audit، تغييرات حالة، مرفقات |
| `Tender` | `id, title, entity, source?, url?, closingDate, description?, status, rejectionReason?, managerApprovedAt?, currentAssigneeId?, createdById, createdAt, updatedAt` | `@@index([status]) , @@index([closingDate]) , @@index([currentAssigneeId])` |
| `ChecklistTemplate` | `id, name, isActive, createdAt, updatedAt` | يملك `ChecklistItem[]` |
| `ChecklistItem` | `id, templateId, text, order` | `onDelete: Cascade` من القالب؛ `@@index([templateId])` |
| `TenderChecklistAnswer` | `id, tenderId, itemId, checked, note?, updatedAt` | `@@unique([tenderId, itemId])`؛ Cascade |
| `Attachment` | `id, tenderId, fileName, storagePath, mimeType, size, version, uploadedById, createdAt` | `@@index([tenderId])`؛ Cascade من المناقصة |
| `Notification` | `id, userId, tenderId?, type, message, isRead, createdAt` | `@@index([userId, isRead])` |
| `AuditLog` | `id, tenderId?, userId, action, details(Json)?, createdAt` | `@@index([tenderId]) , @@index([userId])` — **بلا تعديل/حذف** |
| `TenderStatusHistory` | `id, tenderId, fromStatus?, toStatus, changedById, note?, createdAt` | `@@index([tenderId])` |
| `SystemSetting` | `key (PK), value, updatedAt` | يخزّن `closingReminderDays` |

### 6.2 تعدادات (Enums)
- `Role`: `ADMIN, QA, WRITER, MANAGER, OWNER`.
- `TenderStatus`: `NEW, UNDER_REVIEW, REJECTED, PROPOSAL_PREPARATION, PENDING_APPROVAL, SUBMITTED, WON, LOST`.

### 6.3 قواعد التكامل (Integrity Rules)
- حذف تعاقبي (Cascade) للبنود/الإجابات/المرفقات/الإشعارات/تاريخ الحالات عند حذف الكيان الأب.
- `email` فريد على المستوى العام؛ `(tenderId, itemId)` فريد لإجابات الـChecklist.
- كل تغيير حالة يكتب صفًّا في `TenderStatusHistory` + قيد `AuditLog` ضمن معاملة واحدة (NFR-012).

---

## 7. متطلبات دورة الحياة (State Machine Requirements)

المصدر الوحيد: ثابت `TRANSITIONS` في `services/tenderWorkflow.ts`.

```
NEW ──REVIEW_START(QA)──▶ UNDER_REVIEW
UNDER_REVIEW ──ASSIGN_WRITER(QA)──▶ PROPOSAL_PREPARATION
UNDER_REVIEW ──REVIEW_REJECT(QA)──▶ REJECTED
PROPOSAL_PREPARATION ──SUBMIT_FOR_APPROVAL(WRITER)──▶ PENDING_APPROVAL
PENDING_APPROVAL ──MANAGER_RETURN(MANAGER)──▶ PROPOSAL_PREPARATION
PENDING_APPROVAL ──MANAGER_STOP(MANAGER)──▶ REJECTED
PENDING_APPROVAL ──MARK_SUBMITTED(MANAGER)──▶ SUBMITTED
SUBMITTED ──RESULT_WON(MANAGER)──▶ WON
SUBMITTED ──RESULT_LOST(MANAGER)──▶ LOST
```

- اعتماد المدير (`ACT-08`) **ليس** انتقال حالة؛ يضبط `managerApprovedAt` وتبقى `PENDING_APPROVAL` (تمهيدًا لـ`MARK_SUBMITTED` وفق BR-004).
- أي انتقال خارج الجدول → `422 INVALID_TRANSITION`؛ بدور غير مسموح → `403 FORBIDDEN_TRANSITION`.

المرجع الكامل: [01 — كتالوج قواعد العمل](./01-business-rules-catalogue.md) §جدول الانتقالات.

---

## الملحق أ — مصفوفة التتبّع (Traceability Matrix)

| المتطلب | قاعدة العمل | الإجراء | الشاشة | الرحلة | حالة القبول |
|---|---|---|---|---|---|
| FR-AUTH-01/06 | — | — | SCR-01 | JRN-07 | UAT-AUTH-01/06/11 |
| FR-TEN-01 | BR-010 | ACT-01 | SCR-05 | JRN-01 | UAT-TEN-01/03/04 |
| FR-TEN-02 | — | ACT-01 | SCR-05 | JRN-01 | UAT-TEN-07/08/09 |
| FR-TEN-05 | — | ACT-02 | SCR-05 | — | UAT-TEN-17/18 |
| FR-REV-03 | BR-001/002 | ACT-04/06 | SCR-04 | JRN-02 | UAT-REV-07/09/10 |
| FR-REV-04 | BR-001/003 | ACT-05 | SCR-04 | JRN-02 | UAT-REV-11/12/13 |
| FR-APR-01 | — | ACT-07 | SCR-04 | JRN-03 | UAT-APR-01/02 |
| FR-APR-02 | BR-002/011 | ACT-08/09 | SCR-04 | JRN-04 | UAT-APR-04/05/06/08 |
| FR-APR-03 | BR-004 | ACT-10 | SCR-04 | JRN-05 | UAT-APR-11/12 |
| FR-APR-04 | BR-005 | ACT-11 | SCR-04 | JRN-06 | UAT-APR-13/14/15 |
| FR-ATT-01 | — | ACT-13 | SCR-04 | JRN-03 | UAT-ATT-01/03/04 |
| FR-NOT-03 | — | ACT-14 | SCR-04 (جرس) | كل الرحلات | UAT-NOT-05/06/07 |
| FR-REP-01 | — | ACT-15 | SCR-08 | JRN-07 | UAT-REP-01/02 |
| FR-AUD-01/02 | BR-008 | ACT-16 | SCR-04 | JRN-07 | UAT-AUD-01/02/03 |
| FR-USR-01..03 | — | ACT-12 | SCR-06 | — | UAT-USR-01..09 |
| FR-SET-02 | BR-009 | ACT-17 | SCR-09 | — | UAT-SET-02/03/04 |
| FR-JOB-01 | BR-009 | — | — | — | UAT-JOB-01..04 |

## الملحق ب — القيود وما هو غير منفَّذ (Constraints & Not Implemented)

مذكورة صراحةً حتى لا تُعامَل كمتطلبات قائمة (مطابقة لقسم القيود في [05](./05-user-acceptance-testing-plan.md)):

1. **لا تسجيل ذاتي، لا إعادة تعيين كلمة مرور، لا تعديل ملف شخصي ذاتي، لا حذف مستخدم** (تعطيل فقط).
2. **الحماية الذاتية للأدمن واجهية فقط** — الـAPI لا يمنع الأدمن من تعطيل/تخفيض نفسه (`adminUsers.ts` بلا فحص `req.user.id === target.id`).
3. **تفويض تحميل/رفع المرفقات غير مقيَّد بعلاقة المناقصة** — سياسة معتمدة في [02](./02-roles-permissions-matrix.md) (كل مصادَق يقرأ الكل)، لكنها نقطة انتباه أمنية.
4. **لا إبطال JWT/جلسات** — `logout` يمسح الكوكي فقط؛ التوكن صالح حتى انتهائه (7 أيام).
5. **`JWT_SECRET` بلا fail-fast** — قيمة افتراضية معروفة إن غاب المتغير (`env.ts:17`).
6. **لا توكن CSRF مخصص** — الاعتماد على `SameSite=Lax`.
7. **لا سياسة كلمة مرور قوية** — `min(8)` فقط، bcrypt cost=10.
8. **لا `trust proxy`** (يؤثر على `req.ip`/rate-limit خلف بروكسي)، ولا إيقاف رشيق، ولا `/readyz` يفحص القاعدة (NFR-011 جزئي).
9. **`/ping` endpoint تجريبي مكشوف** — يُوصى بإزالته/تقييده إنتاجيًا.
10. **لا استيراد (Import) ولا وضع داكن، ولا إشعارات بريدية** (قاعدة بيانات فقط).

> خطة معالجة هذه القيود موثّقة في `CLAUDE_CODE_PROMPT_Tender_Hardening.md` (المراحل H0…H4).

---

## سجل التغييرات (Change Log)

| الإصدار | التاريخ | التغيير |
|---|---|---|
| 1.0 | 2026-07-23 | إصدار أول للـSRS — مستخرَج من تنفيذ v1.0 + تحسينات ما بعد الإصدار، مع تتبّع كامل إلى الكود وحزمة التصميم. |

</div>
