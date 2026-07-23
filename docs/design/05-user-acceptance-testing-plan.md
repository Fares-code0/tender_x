# 05 — خطة اختبار قبول المستخدم (User Acceptance Testing Plan)

<div dir="rtl">

## الغرض (Purpose)

هذا المستند خطة **اختبار قبول المستخدم (UAT)** لنظام إدارة المناقصات (Smart Tender Management System). كل حالة اختبار هنا **مشتقّة من التنفيذ الفعلي** في الكود (Backend/Frontend/DB/الـschemas المشتركة) ومن حزمة التصميم القائمة (`01`…`04`)، ومربوطة بمصدرها لتحقيق التتبّع الكامل (Traceability). **لم تُخترَع أي متطلبات**؛ وما هو غير منفّذ مذكور صراحةً في قسم [القيود المعروفة](#القيود-المعروفة-وما-هو-غير-منفَّذ).

هذا المستند مبني على:
- [01 — كتالوج قواعد العمل](./01-business-rules-catalogue.md) (`BR-xxx`، State Machine)
- [02 — مصفوفة الأدوار والصلاحيات](./02-roles-permissions-matrix.md) (`ACT-xxx`)
- [03 — رحلات المستخدمين](./03-user-journeys.md) (`JRN-xxx`)
- [04 — جرد الشاشات ومواصفاتها](./04-screen-inventory-and-specs.md) (`SCR-xxx`)
- الكود: `apps/api/src/**`, `apps/web/src/**`, `packages/shared/src/**`, `apps/api/prisma/schema.prisma`.

## النطاق (Scope)

**داخل النطاق:** المصادقة والجلسات، لوحة المعلومات، تسجيل/تعديل/عرض المناقصات، مراجعة الجودة والـChecklist، اعتماد المدير ودورة الحياة (State Machine)، قوالب الـChecklist، المرفقات، الإشعارات، التقارير وتصدير CSV، سجل العمليات (Audit)، إدارة المستخدمين، إعدادات النظام، مهمة تنبيه الإغلاق المجدولة، والضوابط الأمنية/RBAC العرضية — كما هي **منفّذة فعليًا** حتى الإصدار v1.0 + تحسينات ما بعد الإصدار.

**خارج النطاق:** أي ميزة غير منفّذة (انظر القيود المعروفة)، اختبار الأداء/الحمل، اختبار الاختراق العميق، اختبار التوافق عبر المتصفحات كبند رسمي (يُغطّى سطحيًا في UI فقط).

## نظرة عامة على النظام (System Overview)

| البند | التفصيل |
|---|---|
| النوع | نظام ويب داخلي لإدارة دورة حياة المناقصات |
| الواجهة (Frontend) | React 18 + TypeScript + Vite + Tailwind (RTL) + TanStack Query + Recharts + React Router |
| الخادم (Backend) | Node.js + Express 4 + TypeScript |
| ORM/DB | Prisma 6 + PostgreSQL 16 |
| المصادقة | JWT في httpOnly cookie + bcrypt |
| التحقق | Zod مشترك بين الطرفين (`packages/shared`) |
| الأمان | Helmet + CORS مضبوط + rate-limit على تسجيل الدخول |
| الأدوار | ADMIN, QA, WRITER, MANAGER, OWNER |
| نموذج الحالة | State Machine مركزية (`services/tenderWorkflow.ts`) — كل تغييرات الحالة تمر عبر `recordStatusChange()` |
| شكل الخطأ الموحّد | `{ "error": { "code", "message", "details?" } }` (`lib/errors.ts`) |

**الحالات (`TenderStatus`):** `NEW → UNDER_REVIEW → (REJECTED | PROPOSAL_PREPARATION) → PENDING_APPROVAL → (SUBMITTED | PROPOSAL_PREPARATION | REJECTED) → (WON | LOST)`.

## استراتيجية الاختبار (Test Strategy)

- **مصدر كل حالة:** يُذكر في عمود «المصدر (تتبّع)» بصيغة `BR/ACT · Endpoint · JRN/SCR · ملف الكود`.
- **تعيين الحقول المطلوبة على الأعمدة:** كل حالة تحمل الحقول التالية: `UAT ID`, `الميزة/الهدف` (Feature + Test Objective), `النوع`, `الدور` (User Role), `المتطلبات المسبقة` (Preconditions), `بيانات الاختبار` (Test Data), `الخطوات` (Steps), `النتيجة المتوقعة` (Expected Result), `أولوية` (Priority), `خطورة` (Risk Level), `المصدر` (Business Requirement + Traceability), `الحالة` (Status).
- **النتيجة الفعلية (Actual Result):** تُترَك فارغة وتُملأ أثناء التنفيذ. **الحالة (Status)** الابتدائية لكل الحالات = **«لم تُنفَّذ» (Not Executed)**.
- **الشدّة (Severity):** افتراضيًا تساوي «الخطورة» ما لم يُذكر خلاف ذلك في ملاحظات القسم.
- **أنواع الاختبار (النوع):** `P` إيجابي · `N` سلبي · `S` أمني · `B` قاعدة عمل · `A` API · `U` واجهة · `D` قاعدة بيانات.
- **بيانات الدخول للبيئة (من البذرة `prisma/seed.ts`):** الحسابات `admin@test.com`, `qa@test.com`, `writer@test.com`, `manager@test.com`, `owner@test.com` — كلمة المرور للجميع **`Test1234!`**.

## معايير الدخول (Entry Criteria)

1. بناء أخضر: `pnpm lint && pnpm test && pnpm build` ناجح.
2. قاعدة بيانات مُهيّأة ومُبذورة (`pnpm db:migrate && pnpm db:seed`).
3. الخادم (`:4000`) والواجهة (`:5173`) قيد التشغيل.
4. توفّر حسابات الأدوار الخمسة.

## معايير الخروج (Exit Criteria)

1. تنفيذ 100% من حالات الأولوية «عالية».
2. لا عيوب مفتوحة بشدّة «حرجة/عالية».
3. توثيق كل انحراف (Actual ≠ Expected) كعيب بمعرّف.
4. موافقة صاحب المنتج على العيوب المتبقية منخفضة الشدّة.

## الأدوار (User Roles)

| الدور | التسمية | المسؤوليات الأساسية |
|---|---|---|
| QA | مراجع الجودة | تسجيل المناقصة، الـChecklist، التحويل/الاستبعاد المبكر |
| WRITER | كاتب العروض | المرفقات، إرسال العرض للاعتماد (المعيّن فقط) |
| MANAGER | المدير | اعتماد/إعادة/إيقاف، تسجيل التقديم والنتيجة |
| OWNER | المالك | اطّلاع/قراءة + تقارير فقط |
| ADMIN | مسؤول النظام | إدارة المستخدمين، الإعدادات، تعديل بيانات المناقصة |

## الافتراضات (Assumptions)

- rate-limit تسجيل الدخول **مفعّل** خارج بيئة الاختبار (`NODE_ENV !== 'test'`)، لذا حالات الـ429 تُنفَّذ على بيئة dev/staging لا على مجموعة الاختبار الآلي.
- «كل مستخدم داخلي يقرأ كل المناقصات» سياسة معتمدة صراحةً في `02` (تحميل المرفقات + التفاصيل متاحان لأي مصادَق).
- الإشعارات تُخزَّن في القاعدة فقط (لا بريد إلكتروني — خارج النطاق).

## البيئة (Environment)

| المكوّن | القيمة |
|---|---|
| API | `http://localhost:4000` |
| Web | `http://localhost:5173` (proxy `/api` → `:4000`) |
| DB | PostgreSQL 16 (`postgresql://…/tender_dev`) |
| متغيرات البيئة | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` (افتراضي 7d), `PORT`, `WEB_ORIGIN` |

---

# الوحدات (Modules)

## 1) المصادقة والجلسات (Authentication & Session)

### نظرة عامة
تسجيل الدخول/الخروج و`/me` عبر `apps/api/src/routes/auth.ts`، والحراسة عبر `middleware/auth.ts` (JWT في كوكي httpOnly، إعادة جلب المستخدم والتحقق من `isActive` في كل طلب)، وحماية المسارات في الواجهة عبر `components/ProtectedRoute.tsx`. الشاشة: `SCR-01` (`LoginPage.tsx`).

### سير العمل
`POST /auth/login` يتحقق من البريد/كلمة المرور (bcrypt) → يُصدر JWT في كوكي → الواجهة تُعيد التوجيه إلى `/`. `requireAuth` يفكّ التوكن، يجلب المستخدم، ويرفض المعطّل/المحذوف بـ401. `POST /auth/logout` يمسح الكوكي.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-AUTH-01 | تسجيل دخول ناجح | P,A | كل الأدوار | حساب فعّال | `qa@test.com` / `Test1234!` | إرسال النموذج بالبيانات الصحيحة | `200` + كوكي `token` (httpOnly) + كائن المستخدم؛ توجيه إلى `/` | عالية | عالٍ | `auth.ts:login` · SCR-01 · JRN-07 | لم تُنفَّذ |
| UAT-AUTH-02 | كلمة مرور خاطئة | N,S | QA | حساب فعّال | `qa@test.com` / `wrong` | إرسال بيانات خاطئة | `401 INVALID_CREDENTIALS` «بيانات الدخول غير صحيحة» | عالية | عالٍ | `auth.ts:29` | لم تُنفَّذ |
| UAT-AUTH-03 | بريد غير مسجّل | N | — | — | `nobody@x.com` / `Test1234!` | إرسال | `401 INVALID_CREDENTIALS` (نفس رسالة 02 — عدم كشف وجود الحساب) | عالية | عالٍ | `auth.ts:26` | لم تُنفَّذ |
| UAT-AUTH-04 | صيغة بريد غير صالحة | N,U | — | — | `not-an-email` / `x` | إرسال | `422 VALIDATION_ERROR` «بريد إلكتروني غير صالح» (تحقق Zod محلي أولًا) | متوسطة | متوسط | `loginSchema` · `auth.ts` | لم تُنفَّذ |
| UAT-AUTH-05 | حقول فارغة | N,U | — | — | فراغ/فراغ | إرسال بلا إدخال | منع محلي + رسالة «مطلوب»؛ لا نداء ناجح | متوسطة | متوسط | `loginSchema.min(1)` | لم تُنفَّذ |
| UAT-AUTH-06 | حساب معطّل يُمنع | N,S,B | مستخدم `isActive=false` | تعطيل حساب عبر Admin | `disabled@test.com` | محاولة دخول | `403 ACCOUNT_DISABLED` «هذا الحساب معطّل» | عالية | عالٍ | `auth.ts:27` | لم تُنفَّذ |
| UAT-AUTH-07 | حدّ محاولات الدخول | N,S | — | بيئة `NODE_ENV≠test` | 6 محاولات فاشلة/15د | تكرار محاولة فاشلة 6 مرات | المحاولة السادسة `429 RATE_LIMITED` + رؤوس `RateLimit-*` | عالية | عالٍ | `app.ts:36` (5/15د) | لم تُنفَّذ |
| UAT-AUTH-08 | `/me` بجلسة صالحة | P,A | أي مصادَق | مسجّل دخول | كوكي صالح | `GET /auth/me` | `200` + `{ user }` بالدور الصحيح | عالية | متوسط | `auth.ts:me` · `requireAuth` | لم تُنفَّذ |
| UAT-AUTH-09 | `/me` بلا كوكي | N,S,A | زائر | لا كوكي | — | `GET /auth/me` بلا كوكي | `401 UNAUTHENTICATED` «يجب تسجيل الدخول» | عالية | عالٍ | `middleware/auth.ts:27` | لم تُنفَّذ |
| UAT-AUTH-10 | توكن مزوّر/تالف | N,S | مهاجم | — | كوكي `token=abc.def` | نداء مسار محمي بتوكن غير صالح | `401 UNAUTHENTICATED` «جلسة غير صالحة» | عالية | عالٍ | `middleware/auth.ts:31` | لم تُنفَّذ |
| UAT-AUTH-11 | تعطيل أثناء الجلسة | N,S,B | مستخدم عُطّل بعد الدخول | جلسة قائمة ثم تعطيل | — | نداء مسار محمي بعد تعطيل الحساب | `401 UNAUTHENTICATED` (إعادة الجلب تكشف `isActive=false`) | عالية | عالٍ | `middleware/auth.ts:35` | لم تُنفَّذ |
| UAT-AUTH-12 | تسجيل الخروج | P,A | أي مصادَق | مسجّل دخول | — | `POST /auth/logout` | `200 {ok}` + مسح الكوكي؛ نداء لاحق محمي `401` | عالية | متوسط | `auth.ts:logout` | لم تُنفَّذ |
| UAT-AUTH-13 | حماية خصائص الكوكي | S | — | dev/prod | فحص رأس `Set-Cookie` | تسجيل دخول وفحص الكوكي | `HttpOnly` مضبوط؛ `Secure` في الإنتاج؛ `SameSite=Lax` | عالية | عالٍ | `auth.ts:15-20` | لم تُنفَّذ |

**ملاحظات:** لا يوجد **تسجيل ذاتي (Registration)** ولا **إعادة تعيين كلمة مرور** — لا تُنشأ لهما حالات (انظر القيود). `UAT-AUTH-13` (Secure) تُنفَّذ فقط في بيئة إنتاج فعلية.

---

## 2) لوحة المعلومات (Dashboard)

### نظرة عامة
`GET /dashboard` (`routes/dashboard.ts`) يعيد محتوى حسب الدور + إحصائيات شاملة (توزيع الحالات، شهريًا). مؤشرات الأداء (نسبة الفوز، متوسط زمن المراحل) لـMANAGER/OWNER/ADMIN فقط. الشاشة: `SCR-02` (`DashboardPage.tsx`، Recharts). المصدر الحسابي: `services/stats.ts`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-DASH-01 | كروت QA | P,U | QA | بيانات مناقصات | — | فتح `/` | كروت «جديدة/قيد مراجعتي/قريبة الإغلاق» بأرقام صحيحة | متوسطة | متوسط | `dashboard.ts:19` · SCR-02 | لم تُنفَّذ |
| UAT-DASH-02 | كروت WRITER | P,U | WRITER | مناقصات معيّنة | — | فتح `/` | كروت «مهامي/المعادة لي» | متوسطة | متوسط | `dashboard.ts:32` | لم تُنفَّذ |
| UAT-DASH-03 | كروت MANAGER | P,U | MANAGER | مناقصات بانتظار الاعتماد | — | فتح `/` | كروت «بانتظار اعتمادي/المقدَّمة» | متوسطة | متوسط | `dashboard.ts:48` | لم تُنفَّذ |
| UAT-DASH-04 | حصر مؤشرات الأداء | S,B | QA/WRITER | — | — | فحص استجابة `/dashboard` | `winRate=null` و`avgStageDurationDays=null` لغير الإشرافيين | عالية | متوسط | `dashboard.ts:63-69` | لم تُنفَّذ |
| UAT-DASH-05 | كشف مؤشرات الأداء | P,B | MANAGER/OWNER/ADMIN | نتائج WON/LOST | — | فتح `/` | ظهور «نسبة الفوز» و«متوسط زمن المراحل» | متوسطة | متوسط | `dashboard.ts:63` | لم تُنفَّذ |
| UAT-DASH-06 | حالة الفراغ | U | أي مصادَق | لا مناقصات | قاعدة فارغة | فتح `/` | كروت=0 والرسوم «لا توجد بيانات» بلا انهيار | منخفضة | منخفض | SCR-02 §الحالات | لم تُنفَّذ |
| UAT-DASH-07 | حماية عند انتهاء الجلسة | S,U | أي | جلسة منتهية | كوكي منتهٍ | فتح `/` | `useMe`→401 وإعادة التوجيه إلى `/login` | عالية | عالٍ | `ProtectedRoute.tsx:15` | لم تُنفَّذ |

---

## 3) المناقصات — التسجيل والبيانات والقوائم (Tenders Core)

### نظرة عامة
`routes/tenders.ts`: إنشاء (QA)، قائمة بفلاتر/ترقيم، تفاصيل، تعديل (QA/MANAGER/ADMIN) مع **قفل بعد التقديم/الإغلاق**، ومنع التكرار القابل للتجاوز بـ`force`. الشاشات: `SCR-03` (قائمة)، `SCR-04` (تفاصيل)، `SCR-05` (نموذج). التحقق: `packages/shared/schemas/tender.ts`.

### سير العمل
QA يُنشئ (`NEW`) → أي مصادَق يعرض القائمة/التفاصيل → التعديل مسموح للحالات النشطة فقط (`isTenderEditable`).

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-TEN-01 | إنشاء مناقصة (QA) | P,A,D,B | QA | مسجّل QA | title/entity/closingDate صالحة | `POST /tenders` | `201` + `status=NEW` + صف `TenderStatusHistory` + Audit `TENDER_CREATED` | عالية | عالٍ | ACT-01·BR-010·`tenders.ts:59`·JRN-01 | لم تُنفَّذ |
| UAT-TEN-02 | منع الإنشاء لغير QA | N,S | WRITER/MANAGER/OWNER/ADMIN | مسجّل غير QA | بيانات صالحة | `POST /tenders` | `403 FORBIDDEN` «ليست لديك صلاحية» | عالية | عالٍ | `requireRole('QA')` · ACT-01 | لم تُنفَّذ |
| UAT-TEN-03 | الجهة المعلنة إلزامية | N,B | QA | — | بلا `entity` | `POST /tenders` | `422 VALIDATION_ERROR` «الجهة المعلنة مطلوبة» | عالية | عالٍ | BR-010·`createTenderSchema` | لم تُنفَّذ |
| UAT-TEN-04 | موعد الإغلاق إلزامي | N,B | QA | — | بلا `closingDate` | `POST /tenders` | `422` «موعد الإغلاق مطلوب» | عالية | عالٍ | BR-010·`createTenderSchema` | لم تُنفَّذ |
| UAT-TEN-05 | حد أدنى للعنوان | N,U | QA | — | `title="ab"` | `POST /tenders` | `422` «3 أحرف على الأقل» | متوسطة | منخفض | `createTenderSchema.min(3)` | لم تُنفَّذ |
| UAT-TEN-06 | رابط غير صالح | N,U | QA | — | `url="abc"` | `POST /tenders` | `422` «رابط غير صالح» | منخفضة | منخفض | `createTenderSchema.url()` | لم تُنفَّذ |
| UAT-TEN-07 | كشف تكرار (عنوان+جهة) | N,B | QA | مناقصة قائمة بنفس العنوان/الجهة | نفس title+entity | `POST /tenders` بلا `force` | `409 DUPLICATE_TENDER` + `details.duplicate` | عالية | متوسط | `tenders.ts:64-81`·JRN-01 | لم تُنفَّذ |
| UAT-TEN-08 | كشف تكرار (نفس الرابط) | N,B | QA | مناقصة بنفس `url` | نفس url | `POST /tenders` بلا force | `409 DUPLICATE_TENDER` | متوسطة | متوسط | `tenders.ts:67` | لم تُنفَّذ |
| UAT-TEN-09 | تجاوز التكرار (force) | P,B | QA | تحذير تكرار ظهر | `?force=1` | إعادة الإرسال مع force | `201` وإنشاء المناقصة رغم التكرار | متوسطة | متوسط | `tenders.ts:62`·SCR-05 | لم تُنفَّذ |
| UAT-TEN-10 | قائمة + ترقيم | P,A | أي مصادَق | >20 مناقصة | `page=2&pageSize=20` | `GET /tenders?page=2` | `200` + `{tenders,total,page,pageSize}`، حجم الصفحة صحيح | عالية | متوسط | `tenders.ts:127`·SCR-03 | لم تُنفَّذ |
| UAT-TEN-11 | فلتر الحالة | P,A | أي مصادَق | مناقصات متنوعة | `status=NEW` | `GET /tenders?status=NEW` | نتائج بحالة `NEW` فقط | متوسطة | منخفض | `tenders.ts:131` | لم تُنفَّذ |
| UAT-TEN-12 | بحث حر (عنوان/جهة) | P,A | أي مصادَق | — | `q=صحة` | `GET /tenders?q=صحة` | تطابق جزئي غير حسّاس لحالة الأحرف على العنوان/الجهة | متوسطة | منخفض | `tenders.ts:142` | لم تُنفَّذ |
| UAT-TEN-13 | فلتر المسؤول | P,A | أي مصادَق | مناقصات معيّنة | `assigneeId` صالح | `GET /tenders?assigneeId=…` | نتائج المسؤول المحدد فقط | متوسطة | منخفض | `tenders.ts:133`·SCR-03 | لم تُنفَّذ |
| UAT-TEN-14 | فلتر نطاق الإغلاق + ترتيب | P,A | أي مصادَق | — | `closingAfter`,`closingBefore`,`sort=closing_desc` | `GET /tenders?...` | تصفية بالنطاق وترتيب تنازلي بالإغلاق | منخفضة | منخفض | `tenders.ts:134-157` | لم تُنفَّذ |
| UAT-TEN-15 | تفاصيل المناقصة | P,A | أي مصادَق | مناقصة قائمة | `id` صالح | `GET /tenders/:id` | `200` + المسؤول/المنشئ/`statusHistory` مرتّب | عالية | متوسط | `tenders.ts:191`·SCR-04 | لم تُنفَّذ |
| UAT-TEN-16 | تفاصيل معرّف غير موجود | N,A | أي مصادَق | — | `id=xxx` | `GET /tenders/xxx` | `404 NOT_FOUND` «المناقصة غير موجودة» | متوسطة | منخفض | `tenders.ts:204` | لم تُنفَّذ |
| UAT-TEN-17 | تعديل مناقصة نشطة | P,A,D | QA/MANAGER/ADMIN | حالة نشطة | `{title}` جديد | `PATCH /tenders/:id` | `200` + Audit `TENDER_UPDATED` بقائمة الحقول المتغيّرة | عالية | عالٍ | ACT-02·`tenders.ts:212` | لم تُنفَّذ |
| UAT-TEN-18 | قفل التعديل بعد الإغلاق | N,B | QA/MANAGER/ADMIN | حالة `SUBMITTED/WON/LOST/REJECTED` | — | `PATCH /tenders/:id` | `422 TENDER_LOCKED` «لا يمكن تعديل مناقصة بعد تقديمها أو إغلاقها» | عالية | عالٍ | ACT-02·`isTenderEditable`·`tenders.ts:218` | لم تُنفَّذ |
| UAT-TEN-19 | منع التعديل لغير المخوَّل | N,S | WRITER/OWNER | حالة نشطة | `{title}` | `PATCH /tenders/:id` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('QA','MANAGER','ADMIN')` | لم تُنفَّذ |
| UAT-TEN-20 | تعديل بلا أي حقل | N,U | QA | — | `{}` | `PATCH /tenders/:id` | `422` «لا يوجد أي حقل للتعديل» | منخفضة | منخفض | `updateTenderSchema.refine` | لم تُنفَّذ |

---

## 4) مراجعة الجودة والـChecklist (QA Review)

### نظرة عامة
`routes/tenders.ts`: بدء المراجعة، جلب/حفظ إجابات الـChecklist، قرار المراجعة (اعتماد يتطلب اكتمال الـChecklist — BR-001، أو استبعاد بسبب — BR-002)، وتعيين كاتب (BR-001 + BR-003). الشاشة: تبويب «المراجعة» في `SCR-04` (`ReviewTab.tsx`). التحقق: `schemas/checklist.ts`, `schemas/workflow.ts`.

### سير العمل (JRN-02)
`NEW →(REVIEW_START)→ UNDER_REVIEW` → حفظ الـChecklist → إمّا `ASSIGN_WRITER → PROPOSAL_PREPARATION` أو `REVIEW_REJECT → REJECTED`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-REV-01 | بدء المراجعة | P,B,D | QA | مناقصة `NEW` | — | `POST /tenders/:id/review/start` | `200` + `UNDER_REVIEW` + Audit `REVIEW_STARTED` | عالية | عالٍ | `REVIEW_START`·`tenders.ts:245`·JRN-02 | لم تُنفَّذ |
| UAT-REV-02 | بدء المراجعة من حالة خاطئة | N,B | QA | مناقصة `PROPOSAL_PREPARATION` | — | `POST /:id/review/start` | `422 INVALID_TRANSITION` | متوسطة | متوسط | `resolveTransition`·`tenderWorkflow.ts:68` | لم تُنفَّذ |
| UAT-REV-03 | جلب بنود الـChecklist | P,A | أي مصادَق | قالب نشط | — | `GET /tenders/:id/checklist` | `200` + بنود القالب النشط + الإجابات المحفوظة | متوسطة | متوسط | `tenders.ts:269` | لم تُنفَّذ |
| UAT-REV-04 | حفظ إجابات الـChecklist | P,A,D | QA | `UNDER_REVIEW` + قالب | `[{itemId,checked,note}]` | `PUT /tenders/:id/checklist` | `200` + الإجابات محفوظة + Audit `CHECKLIST_SAVED` | عالية | متوسط | ACT-04·`tenders.ts:295` | لم تُنفَّذ |
| UAT-REV-05 | بند غير موجود | N | QA | — | `itemId` وهمي | `PUT /:id/checklist` | `422 INVALID_CHECKLIST_ITEM` | متوسطة | منخفض | `tenders.ts:307` | لم تُنفَّذ |
| UAT-REV-06 | حفظ الـChecklist لغير QA | N,S | WRITER/MANAGER | — | إجابات صالحة | `PUT /:id/checklist` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('QA')` | لم تُنفَّذ |
| UAT-REV-07 | اعتماد بـChecklist ناقص | N,B | QA | بنود غير مكتملة | `decision=approve` | `POST /:id/review/decision` | `422 CHECKLIST_INCOMPLETE` | عالية | عالٍ | BR-001·`tenders.ts:366` | لم تُنفَّذ |
| UAT-REV-08 | اعتماد بـChecklist مكتمل | P,B | QA | كل البنود مؤشَّرة | `decision=approve` | `POST /:id/review/decision` | `200` + `approved:true` + Audit `REVIEW_APPROVED` (تبقى `UNDER_REVIEW`) | عالية | عالٍ | BR-001·`tenders.ts:375` | لم تُنفَّذ |
| UAT-REV-09 | استبعاد بسبب | P,B,D | QA | `UNDER_REVIEW` | `decision=reject, rejectionReason="..."` | `POST /:id/review/decision` | `200` + `REJECTED` + حفظ السبب + Audit `REVIEW_REJECTED` | عالية | عالٍ | ACT-06·BR-002·`tenders.ts:348` | لم تُنفَّذ |
| UAT-REV-10 | استبعاد بلا سبب | N,B | QA | `UNDER_REVIEW` | `decision=reject` بلا سبب | `POST /:id/review/decision` | `422` «سبب الاستبعاد مطلوب» | عالية | عالٍ | BR-002·`reviewDecisionSchema` | لم تُنفَّذ |
| UAT-REV-11 | تعيين كاتب ناجح | P,B,D | QA | Checklist مكتمل | `assigneeId` كاتب نشط | `POST /tenders/:id/assign` | `200` + `PROPOSAL_PREPARATION` + `currentAssignee`=الكاتب + إشعار `ASSIGNED` | عالية | عالٍ | ACT-05·BR-001/003·`tenders.ts:389` | لم تُنفَّذ |
| UAT-REV-12 | تعيين قبل اكتمال الـChecklist | N,B | QA | بنود ناقصة | assignee صالح | `POST /:id/assign` | `422 CHECKLIST_INCOMPLETE` | عالية | عالٍ | BR-001·`tenders.ts:397` | لم تُنفَّذ |
| UAT-REV-13 | تعيين غير كاتب/معطّل | N,B | QA | Checklist مكتمل | `assigneeId` لمدير/معطّل | `POST /:id/assign` | `422 INVALID_ASSIGNEE` «يجب تعيين كاتب عروض نشط» | عالية | عالٍ | BR-003·`tenders.ts:403` | لم تُنفَّذ |

---

## 5) اعتماد المدير ودورة الحياة (Approval & Result)

### نظرة عامة
`routes/tenders.ts`: إرسال للاعتماد (الكاتب المعيّن فقط)، قرار المدير (اعتماد/إعادة/إيقاف)، تسجيل التقديم (بعد الاعتماد فقط — BR-004)، تسجيل النتيجة (WON/LOST — BR-005). المصدر الحاكم: State Machine `services/tenderWorkflow.ts`. الشاشة: `ActionsBar.tsx` في `SCR-04`.

### سير العمل (JRN-03…06)
`PROPOSAL_PREPARATION →(SUBMIT_FOR_APPROVAL)→ PENDING_APPROVAL →(approve→ managerApprovedAt)→(MARK_SUBMITTED)→ SUBMITTED →(RESULT_WON|RESULT_LOST)→ WON|LOST`؛ أو `MANAGER_RETURN → PROPOSAL_PREPARATION`؛ أو `MANAGER_STOP → REJECTED`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-APR-01 | إرسال للاعتماد (الكاتب المعيّن) | P,B,D | WRITER | مُعيَّن على `PROPOSAL_PREPARATION` | — | `POST /:id/submit-for-approval` | `200` + `PENDING_APPROVAL` + إشعار المدراء `SUBMITTED_FOR_APPROVAL` | عالية | عالٍ | ACT-07·`tenders.ts:434`·JRN-03 | لم تُنفَّذ |
| UAT-APR-02 | إرسال من كاتب غير معيّن | N,S,B | WRITER آخر | ليس `currentAssignee` | — | `POST /:id/submit-for-approval` | `403 NOT_ASSIGNEE` (منع تصعيد أفقي) | عالية | عالٍ | `tenders.ts:441` | لم تُنفَّذ |
| UAT-APR-03 | إرسال لغير WRITER | N,S | QA/MANAGER | — | — | `POST /:id/submit-for-approval` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('WRITER')` | لم تُنفَّذ |
| UAT-APR-04 | اعتماد المدير | P,B,D | MANAGER | `PENDING_APPROVAL` | `decision=approve` | `POST /:id/manager-decision` | `200` + `managerApprovedAt` مضبوط + تبقى `PENDING_APPROVAL` + إشعار الكاتب `APPROVED` | عالية | عالٍ | ACT-08·BR-004·`tenders.ts:482` | لم تُنفَّذ |
| UAT-APR-05 | إعادة بملاحظات | P,B,D | MANAGER | `PENDING_APPROVAL` | `decision=return, notes="راجع البند"` | `POST /:id/manager-decision` | `200` + `PROPOSAL_PREPARATION` + إعادة للكاتب المُرسِل + إشعار `RETURNED` | عالية | عالٍ | ACT-09·BR-011·`tenders.ts:508` | لم تُنفَّذ |
| UAT-APR-06 | إعادة بلا ملاحظات | N,B | MANAGER | `PENDING_APPROVAL` | `decision=return` | `POST /:id/manager-decision` | `422` «ملاحظات الإعادة مطلوبة» | عالية | عالٍ | BR-011·`managerDecisionSchema` | لم تُنفَّذ |
| UAT-APR-07 | إيقاف بسبب | P,B | MANAGER | `PENDING_APPROVAL` | `decision=stop, reason="..."` | `POST /:id/manager-decision` | `200` + `REJECTED` + حفظ السبب | عالية | عالٍ | ACT-06·BR-002·`tenders.ts:540` | لم تُنفَّذ |
| UAT-APR-08 | إيقاف بلا سبب | N,B | MANAGER | `PENDING_APPROVAL` | `decision=stop` | `POST /:id/manager-decision` | `422` «سبب الإيقاف مطلوب» | عالية | عالٍ | BR-002·`managerDecisionSchema` | لم تُنفَّذ |
| UAT-APR-09 | قرار المدير من حالة خاطئة | N,B | MANAGER | حالة ≠ `PENDING_APPROVAL` | `decision=approve` | `POST /:id/manager-decision` | `422 INVALID_TRANSITION` | متوسطة | متوسط | `tenders.ts:477` | لم تُنفَّذ |
| UAT-APR-10 | قرار المدير لغير MANAGER | N,S | QA/WRITER | — | أي قرار | `POST /:id/manager-decision` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('MANAGER')` | لم تُنفَّذ |
| UAT-APR-11 | تقديم قبل الاعتماد | N,B | MANAGER | `PENDING_APPROVAL` بلا `managerApprovedAt` | — | `POST /:id/mark-submitted` | `422 NOT_APPROVED` «لا يمكن تسجيل التقديم قبل اعتماد المدير» | عالية | عالٍ | BR-004·`tenders.ts:567` | لم تُنفَّذ |
| UAT-APR-12 | تسجيل التقديم بعد الاعتماد | P,B,D | MANAGER | `managerApprovedAt` موجود | — | `POST /:id/mark-submitted` | `200` + `SUBMITTED` + Audit `MARKED_SUBMITTED` | عالية | عالٍ | ACT-10·BR-004·`tenders.ts:560`·JRN-05 | لم تُنفَّذ |
| UAT-APR-13 | تسجيل نتيجة «فوز» | P,B,D | MANAGER | `SUBMITTED` | `result=WON` | `POST /:id/result` | `200` + `WON` + إشعار المنشئ `RESULT` | عالية | عالٍ | ACT-11·BR-005·`tenders.ts:589`·JRN-06 | لم تُنفَّذ |
| UAT-APR-14 | تسجيل نتيجة «خسارة» | P,B,D | MANAGER | `SUBMITTED` | `result=LOST` | `POST /:id/result` | `200` + `LOST` + إشعار المنشئ | عالية | عالٍ | ACT-11·BR-005 | لم تُنفَّذ |
| UAT-APR-15 | نتيجة من حالة غير مقدَّمة | N,B | MANAGER | حالة ≠ `SUBMITTED` | `result=WON` | `POST /:id/result` | `422 INVALID_TRANSITION` (لا إغلاق بلا تقديم) | عالية | عالٍ | BR-005·`resolveTransition` | لم تُنفَّذ |

**ملاحظة سير العمل:** أي انتقال غير مُعرَّف في جدول `TRANSITIONS` يُرفض `422 INVALID_TRANSITION`؛ وأي انتقال بدور غير مسموح `403 FORBIDDEN_TRANSITION` — يُغطّى ضمنيًا بـ`UAT-APR-09/10/15` و`UAT-REV-02`.

---

## 6) قوالب الـChecklist (Checklist Templates)

### نظرة عامة
`routes/checklistTemplates.ts`: قائمة (أي مصادَق)، إنشاء/تعديل (ADMIN/MANAGER). التحقق: `schemas/checklist.ts`. المصالحة عند التعديل: تحديث بالـid/إنشاء/حذف المفقود.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-CLT-01 | قائمة القوالب | P,A | أي مصادَق | — | — | `GET /checklist-templates` | `200` + القوالب ببنودها مرتّبة | منخفضة | منخفض | `checklistTemplates.ts:17` | لم تُنفَّذ |
| UAT-CLT-02 | إنشاء قالب | P,A,D | ADMIN/MANAGER | — | `name + items[≥1]` | `POST /checklist-templates` | `201` + Audit `CHECKLIST_TEMPLATE_CREATED` | متوسطة | متوسط | `checklistTemplates.ts:30` | لم تُنفَّذ |
| UAT-CLT-03 | إنشاء لغير المخوَّل | N,S | QA/WRITER/OWNER | — | قالب صالح | `POST /checklist-templates` | `403 FORBIDDEN` | متوسطة | متوسط | `requireRole('ADMIN','MANAGER')` | لم تُنفَّذ |
| UAT-CLT-04 | إنشاء بلا بنود | N,B | ADMIN | — | `items=[]` | `POST /checklist-templates` | `422` «يجب إضافة بند واحد على الأقل» | متوسطة | منخفض | `createChecklistTemplateSchema` | لم تُنفَّذ |
| UAT-CLT-05 | تعديل بنود (مصالحة) | P,A,D | ADMIN/MANAGER | قالب قائم | items بمعرّفات + جديد | `PATCH /checklist-templates/:id` | تحديث الموجود، إنشاء الجديد، حذف المحذوف | متوسطة | متوسط | `checklistTemplates.ts:76` | لم تُنفَّذ |
| UAT-CLT-06 | تفعيل/تعطيل القالب | P,B | ADMIN/MANAGER | قالب قائم | `isActive=false` | `PATCH /checklist-templates/:id` | تغيّر `isActive`؛ يؤثر على القالب النشط في المراجعة | متوسطة | متوسط | `checklistTemplates.ts:66` | لم تُنفَّذ |
| UAT-CLT-07 | تعديل قالب غير موجود | N,A | ADMIN | — | `id=xxx` | `PATCH /checklist-templates/xxx` | `404 NOT_FOUND` | منخفضة | منخفض | `checklistTemplates.ts:63` | لم تُنفَّذ |

---

## 7) المرفقات (Attachments)

### نظرة عامة
`routes/attachments.ts` + `tenders.ts` (الرفع). الرفع: WRITER فقط، خلف `StorageService` (`services/storage.ts`)، قيود النوع (`pdf/docx/xlsx/png/jpg/jpeg/zip`) والحجم (20MB) وversioning. القائمة/التحميل: أي مصادَق. الشاشة: `AttachmentsTab.tsx`. التحقق: `schemas/attachment.ts`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-ATT-01 | رفع ملف صالح | P,A,D | WRITER | مناقصة قائمة | `report.pdf` (<20MB) | `POST /tenders/:id/attachments` | `201` + سجل مرفق `version=1` + Audit `ATTACHMENT_UPLOADED` | عالية | عالٍ | ACT-13·`tenders.ts:625`·JRN-03 | لم تُنفَّذ |
| UAT-ATT-02 | رفع لغير WRITER | N,S | QA/MANAGER/OWNER/ADMIN | — | `report.pdf` | `POST /:id/attachments` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('WRITER')` | لم تُنفَّذ |
| UAT-ATT-03 | نوع غير مسموح | N,S | WRITER | — | `malware.exe` | رفع | `422 INVALID_FILE_TYPE` | عالية | عالٍ | `isAllowedAttachment`·`attachments.ts:18` | لم تُنفَّذ |
| UAT-ATT-04 | تجاوز الحجم | N | WRITER | — | ملف >20MB | رفع | `413 FILE_TOO_LARGE` | متوسطة | متوسط | `MAX_ATTACHMENT_BYTES`·`attachments.ts:37` | لم تُنفَّذ |
| UAT-ATT-05 | بلا ملف | N | WRITER | — | طلب بلا `file` | رفع | `422 NO_FILE` «لم يُرفَق أي ملف» | منخفضة | منخفض | `tenders.ts:629` | لم تُنفَّذ |
| UAT-ATT-06 | Versioning لنفس الاسم | P,D | WRITER | مرفق سابق بنفس الاسم | نفس `report.pdf` | إعادة الرفع | سجل جديد `version=2` مع بقاء القديم | متوسطة | متوسط | `tenders.ts:637`·M5.3 | لم تُنفَّذ |
| UAT-ATT-07 | اسم ملف عربي | P | WRITER | — | `تقرير.pdf` | رفع | حفظ الاسم UTF-8 صحيحًا (لا محارف مشوّهة) | منخفضة | منخفض | `tenders.ts:635` | لم تُنفَّذ |
| UAT-ATT-08 | قائمة مرفقات | P,A | أي مصادَق | مرفقات قائمة | — | `GET /tenders/:id/attachments` | `200` + (الاسم/الإصدار/الرافع/الحجم/التاريخ) | متوسطة | منخفض | `tenders.ts:696` | لم تُنفَّذ |
| UAT-ATT-09 | تحميل مرفق | P,A | أي مصادَق | مرفق قائم | `attachmentId` | `GET /attachments/:id/download` | `200` + المحتوى + `Content-Disposition` باسم صحيح | عالية | متوسط | ACT-13·`attachments.ts:49` | لم تُنفَّذ |
| UAT-ATT-10 | تحميل ملف مفقود بالتخزين | N,A | أي مصادَق | سجل بلا ملف فعلي | — | `GET /attachments/:id/download` | `404 FILE_MISSING` | منخفضة | منخفض | `attachments.ts:57` | لم تُنفَّذ |
| UAT-ATT-11 | وصول أفقي للتحميل | S | أي مصادَق | مرفق لمناقصة أخرى | `attachmentId` لمناقصة لا يملكها | تحميل مباشر بالمعرّف | **متوقّع حاليًا `200`** (سياسة «كل مصادَق يقرأ الكل» — `02`). يُوثَّق كقرار مقصود؛ راجع القيود | عالية | عالٍ | `attachments.ts:49` (بلا فحص علاقة) | لم تُنفَّذ |

**ملاحظة (`UAT-ATT-11`):** لا يوجد تحقق من علاقة المستخدم بالمناقصة عند التحميل (ولا عند الرفع يوجد تحقق أن الكاتب هو المعيّن). هذا **مطابق للسياسة الموثّقة** في `02` لكن يُعامَل كنقطة انتباه أمنية — انظر [القيود المعروفة](#القيود-المعروفة-وما-هو-غير-منفَّذ).

---

## 8) الإشعارات (Notifications)

### نظرة عامة
`routes/notifications.ts` + `services/notifications.ts`. قائمة إشعارات المستخدم (آخر 50) + عدّاد غير المقروء، وتعليم كمقروء (لصاحبها فقط). المكوّن: `NotificationBell.tsx` (تحديث كل 20 ثانية). المصادر: 6 أحداث سير عمل + `CLOSING_SOON`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-NOT-01 | قائمة إشعاراتي | P,A | أي مصادَق | إشعارات قائمة | — | `GET /notifications` | `200` + `{notifications, unreadCount}` لإشعاراته فقط | متوسطة | متوسط | `notifications.ts:11`·ACT-14 | لم تُنفَّذ |
| UAT-NOT-02 | عدّاد غير المقروء | P,A | أي مصادَق | إشعار غير مقروء | — | فحص `unreadCount` | يطابق عدد `isRead=false` | منخفضة | منخفض | `notifications.ts:19` | لم تُنفَّذ |
| UAT-NOT-03 | تعليم كمقروء | P,A,D | أي مصادَق | إشعار له | `notifId` خاصته | `POST /notifications/:id/read` | `200` + `isRead=true` | متوسطة | منخفض | `notifications.ts:28` | لم تُنفَّذ |
| UAT-NOT-04 | تعليم إشعار غيره | N,S | أي مصادَق | إشعار لمستخدم آخر | `notifId` لغيره | `POST /notifications/:id/read` | `404 NOT_FOUND` (عزل أفقي) | عالية | عالٍ | `notifications.ts:31` | لم تُنفَّذ |
| UAT-NOT-05 | إشعار عند التعيين | P,B,D | — | — | تنفيذ ACT-05 | تعيين كاتب | إشعار `ASSIGNED` للكاتب المعيّن | متوسطة | متوسط | `tenders.ts:420` | لم تُنفَّذ |
| UAT-NOT-06 | إشعار المدراء عند الإرسال | P,B,D | — | — | تنفيذ ACT-07 | إرسال للاعتماد | إشعار `SUBMITTED_FOR_APPROVAL` لكل المدراء | متوسطة | متوسط | `tenders.ts:458` | لم تُنفَّذ |
| UAT-NOT-07 | إشعار النتيجة للمنشئ | P,B,D | — | — | تنفيذ ACT-11 | تسجيل النتيجة | إشعار `RESULT` لمنشئ المناقصة | متوسطة | متوسط | `tenders.ts:609` | لم تُنفَّذ |
| UAT-NOT-08 | تحديث الجرس دوريًا | U | أي مصادَق | — | — | إبقاء الصفحة مفتوحة | تحديث العدّاد كل ~20 ثانية | منخفضة | منخفض | `NotificationBell.tsx`·SCR-04 §عام | لم تُنفَّذ |

---

## 9) التقارير وتصدير CSV (Reports)

### نظرة عامة
`routes/reports.ts` (MANAGER/OWNER/ADMIN): ملخّص أعداد الحالات + فوز/خسارة + أداء كل مستخدم، بفلاتر `from/to/userId`. الشاشة: `ReportsPage.tsx` (تصدير CSV مع BOM عربي).

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-REP-01 | ملخّص التقرير | P,A | MANAGER/OWNER/ADMIN | بيانات | — | `GET /reports/summary` | `200` + `byStatus,wonLost,byUser,total` | عالية | متوسط | ACT-15·`reports.ts:19`·SCR-08 | لم تُنفَّذ |
| UAT-REP-02 | حظر التقارير | N,S | QA/WRITER | — | — | `GET /reports/summary` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('MANAGER','OWNER','ADMIN')` | لم تُنفَّذ |
| UAT-REP-03 | فلتر الفترة | P,A | MANAGER | — | `from,to` | `GET /reports/summary?from&to` | نتائج ضمن النطاق فقط | متوسطة | منخفض | `reports.ts:23-31` | لم تُنفَّذ |
| UAT-REP-04 | فلتر المستخدم | P,A | MANAGER | — | `userId` | `GET /reports/summary?userId=…` | مقصور على المستخدم | متوسطة | منخفض | `reports.ts:46` | لم تُنفَّذ |
| UAT-REP-05 | أداء كل مستخدم | P,A | MANAGER | — | — | فحص `byUser` | `tendersCreated` + `statusChanges` لكل مستخدم | متوسطة | منخفض | `reports.ts:52` | لم تُنفَّذ |
| UAT-REP-06 | تصدير CSV | P,U | MANAGER/OWNER/ADMIN | تقرير محمّل | — | نقر «تصدير CSV» | تنزيل ملف CSV ببادئة BOM يفتح عربيًا في Excel | متوسطة | منخفض | `ReportsPage.tsx`·SCR-08 | لم تُنفَّذ |
| UAT-REP-07 | تاريخ غير صالح بالفلتر | N | MANAGER | — | `from=abc` | `GET /reports/summary?from=abc` | معالجة سليمة (رفض/تجاهل) دون خطأ 500 | منخفضة | منخفض | `reportFiltersSchema` (`z.coerce.date`) | لم تُنفَّذ |
| UAT-REP-08 | تقرير فارغ | U | MANAGER | قاعدة فارغة | — | فتح `/reports` | أصفار بلا انهيار | منخفضة | منخفض | SCR-08 §الحالات | لم تُنفَّذ |

**ملاحظة (`UAT-REP-07`):** `z.coerce.date()` قد يحوّل نصًّا غير صالح إلى `Invalid Date`؛ يُتحقَّق أن السلوك لا يُنتج 500 (نقطة انتباه، انظر القيود).

---

## 10) سجل العمليات (Audit Log)

### نظرة عامة
`GET /tenders/:id/audit` (MANAGER/OWNER/ADMIN) — **قراءة فقط، لا مسار حذف/تعديل** (`NFR-005`). المكوّن: `AuditTab.tsx`. القيود تُكتب عبر `lib/audit.ts` في كل انتقالات سير العمل.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-AUD-01 | عرض السجل | P,A | MANAGER/OWNER/ADMIN | مناقصة بتاريخ إجراءات | — | `GET /tenders/:id/audit` | `200` + قيود (من/ماذا/متى) تنازليًا | عالية | متوسط | ACT-16·`tenders.ts:673`·SCR-04 | لم تُنفَّذ |
| UAT-AUD-02 | حظر السجل | N,S | QA/WRITER | — | — | `GET /tenders/:id/audit` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole(...)` | لم تُنفَّذ |
| UAT-AUD-03 | لا مسار حذف/تعديل (NFR-005) | S,B | ADMIN | — | — | محاولة `DELETE/PATCH` على audit | `404`/غير موجود — لا endpoint في أي راوتر | عالية | عالٍ | NFR-005·(فحص المسارات) | لم تُنفَّذ |
| UAT-AUD-04 | القيد يُنشأ مع الإجراء | B,D | — | — | تنفيذ أي انتقال | تنفيذ ACT ثم فحص السجل | ظهور قيد بالإجراء الصحيح والمنفِّذ | عالية | عالٍ | BR-008·`recordStatusChange` | لم تُنفَّذ |
| UAT-AUD-05 | مناقصة غير موجودة | N,A | MANAGER | — | `id=xxx` | `GET /tenders/xxx/audit` | `404 NOT_FOUND` | منخفضة | منخفض | `tenders.ts:682` | لم تُنفَّذ |
| UAT-AUD-06 | ذرّية القيد مع المعاملة | D,B | — | — | فشل مُصطنع وسط انتقال | التحقق من عدم بقاء قيد يتيم | القيد + الحالة + التاريخ في معاملة واحدة (all-or-nothing) | متوسطة | متوسط | `statusChange.ts:$transaction` | لم تُنفَّذ |

---

## 11) إدارة المستخدمين (User Administration)

### نظرة عامة
`routes/adminUsers.ts` (ADMIN فقط): قائمة، إنشاء، تعديل (اسم/دور/تفعيل/كلمة مرور). الشاشة: `AdminUsersPage.tsx` (`SCR-06`). التحقق: `schemas/auth.ts`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-USR-01 | قائمة المستخدمين | P,A | ADMIN | — | — | `GET /admin/users` | `200` + المستخدمون **بدون** `passwordHash` | عالية | عالٍ | ACT-12·`adminUsers.ts:15` | لم تُنفَّذ |
| UAT-USR-02 | حظر لغير ADMIN | N,S | QA/WRITER/MANAGER/OWNER | — | — | `GET /admin/users` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('ADMIN')` | لم تُنفَّذ |
| UAT-USR-03 | إنشاء مستخدم | P,A,D | ADMIN | — | name/email/role/`Passw0rd!` | `POST /admin/users` | `201` + Audit `USER_CREATED`؛ بلا `passwordHash` بالرد | عالية | عالٍ | `adminUsers.ts:24` | لم تُنفَّذ |
| UAT-USR-04 | بريد مكرّر | N,B | ADMIN | بريد مستخدم | بريد قائم | `POST /admin/users` | `409 EMAIL_TAKEN` | عالية | متوسط | `adminUsers.ts:28` | لم تُنفَّذ |
| UAT-USR-05 | كلمة مرور قصيرة | N,B,S | ADMIN | — | `password="123"` | `POST /admin/users` | `422` «8 أحرف على الأقل» | عالية | متوسط | `createUserSchema.min(8)` | لم تُنفَّذ |
| UAT-USR-06 | اسم قصير | N,U | ADMIN | — | `name="a"` | `POST /admin/users` | `422` «الاسم قصير جدًا» | منخفضة | منخفض | `createUserSchema.min(2)` | لم تُنفَّذ |
| UAT-USR-07 | تغيير الدور | P,A,D | ADMIN | مستخدم آخر | `{role:"MANAGER"}` | `PATCH /admin/users/:id` | `200` + Audit `USER_UPDATED` | عالية | عالٍ | `adminUsers.ts:45` | لم تُنفَّذ |
| UAT-USR-08 | تعطيل مستخدم | P,A,D,B | ADMIN | مستخدم فعّال | `{isActive:false}` | `PATCH /admin/users/:id` | `200`؛ المستخدم لا يستطيع الدخول (يربط `UAT-AUTH-06/11`) | عالية | عالٍ | `adminUsers.ts:53` | لم تُنفَّذ |
| UAT-USR-09 | إعادة تعيين كلمة المرور | P,D,S | ADMIN | مستخدم قائم | `{password:"NewPass1!"}` | `PATCH /admin/users/:id` | `200` + إعادة تجزئة bcrypt؛ الدخول بالجديدة يعمل | متوسطة | متوسط | `adminUsers.ts:54` | لم تُنفَّذ |
| UAT-USR-10 | حماية ذاتية (واجهة) | U,S | ADMIN | حساب الأدمن نفسه | — | فتح `SCR-06` على صفّه | تعطيل عناصر «تغيير الدور/تعطيل» لصفّه (تحكم واجهي) | متوسطة | متوسط | SCR-06 §الحماية الذاتية | لم تُنفَّذ |
| UAT-USR-11 | حماية ذاتية على الـAPI | N,S | ADMIN | حساب الأدمن نفسه | `{isActive:false}` على معرّفه | `PATCH /admin/users/{selfId}` | **متوقّع حاليًا `200`** — لا حارس ذاتي على الخادم؛ يُوثَّق كثغرة (انظر القيود) | عالية | عالٍ | `adminUsers.ts:45` (بلا فحص `req.user.id===target.id`) | لم تُنفَّذ |

**ملاحظة مهمّة (`UAT-USR-10/11`):** الحماية الذاتية **موجودة في الواجهة فقط**؛ لا يفرضها الـAPI. لذا يمكن لأدمن تعطيل/تخفيض نفسه عبر نداء مباشر — عيب حقيقي مُوثَّق، وليس اختراعًا. لا يوجد **حذف مستخدم** (تعطيل فقط).

---

## 12) إعدادات النظام (System Settings)

### نظرة عامة
`routes/settings.ts` (ADMIN): قراءة/تعديل `closingReminderDays` (1..60). الشاشة: `SettingsPage.tsx` (`SCR-09`). يقرؤه الـcron حيًّا عبر `getReminderDays()`.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-SET-01 | قراءة الإعدادات | P,A | ADMIN | — | — | `GET /admin/settings` | `200` + `{closingReminderDays}` (افتراضي 3) | متوسطة | منخفض | ACT-17·`settings.ts:13` | لم تُنفَّذ |
| UAT-SET-02 | تعديل صالح | P,A,D,B | ADMIN | — | `{closingReminderDays:7}` | `PATCH /admin/settings` | `200` + حفظ + Audit `SETTINGS_UPDATED` | عالية | متوسط | BR-009·`settings.ts:23` | لم تُنفَّذ |
| UAT-SET-03 | قيمة خارج المدى (0) | N,B | ADMIN | — | `{closingReminderDays:0}` | `PATCH /admin/settings` | `422` «أقل قيمة يوم واحد» | متوسطة | منخفض | `updateSettingsSchema.min(1)` | لم تُنفَّذ |
| UAT-SET-04 | قيمة خارج المدى (61) | N,B | ADMIN | — | `{closingReminderDays:61}` | `PATCH /admin/settings` | `422` «أقصى قيمة 60 يومًا» | متوسطة | منخفض | `updateSettingsSchema.max(60)` | لم تُنفَّذ |
| UAT-SET-05 | حظر لغير ADMIN | N,S | MANAGER/OWNER | — | — | `GET/PATCH /admin/settings` | `403 FORBIDDEN` | عالية | عالٍ | `requireRole('ADMIN')` | لم تُنفَّذ |
| UAT-SET-06 | الـcron يقرأ القيمة حيًّا | B | — | تعديل القيمة | — | تعديل ثم تشغيل المهمة | استخدام القيمة الجديدة في التشغيل التالي | متوسطة | منخفض | `getReminderDays()`·`closingReminder.ts:17` | لم تُنفَّذ |

---

## 13) مهمة تنبيه الإغلاق المجدولة (Closing Reminder Job)

### نظرة عامة
`services/closingReminder.ts` مُجدوَل في `src/index.ts` (`node-cron`, يوميًا 08:00). ينشئ إشعار `CLOSING_SOON` للمناقصات النشطة القريبة الإغلاق دون تكرار (BR-009). دالة `runClosingReminders(now)` تقبل حقن الوقت للاختبار.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-JOB-01 | إنشاء تنبيه ضمن النافذة | P,B,D | نظام | مناقصة نشطة تُغلق خلال X يوم | `days=3` | استدعاء `runClosingReminders(now)` | إشعار `CLOSING_SOON` واحد للمسؤول/المنشئ | عالية | متوسط | BR-009·`closingReminder.ts:28` | لم تُنفَّذ |
| UAT-JOB-02 | عدم التكرار | B,D | نظام | تنبيه سابق موجود | — | تشغيل المهمة مجددًا | لا إشعار جديد لنفس المناقصة | عالية | متوسط | `closingReminder.ts:42` | لم تُنفَّذ |
| UAT-JOB-03 | استثناء المغلقة/البعيدة | B | نظام | مناقصات مغلقة أو بعيدة الإغلاق | — | تشغيل المهمة | لا تنبيه لغير النشطة أو خارج النافذة | متوسطة | منخفض | `ACTIVE_STATUSES`·نطاق التاريخ | لم تُنفَّذ |
| UAT-JOB-04 | المستلِم الصحيح | B | نظام | مناقصة بمسؤول/بلا مسؤول | — | تشغيل المهمة | المستلِم = `currentAssigneeId ?? createdById` | منخفضة | منخفض | `closingReminder.ts:47` | لم تُنفَّذ |

---

## 14) الأمان و RBAC (عرضي — Security)

### نظرة عامة
ضوابط أمنية شاملة عبر النظام: المصادقة، التفويض العمودي/الأفقي، حماية المسارات، عدم كشف البيانات الحسّاسة، ومقاومة الحقن. المصادر: `middleware/auth.ts`, `ProtectedRoute.tsx`, Prisma (parameterized)، Helmet/CORS.

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-SEC-01 | تصعيد عمودي (كتابة QA) | S | WRITER | — | — | `POST /tenders` كـWRITER | `403 FORBIDDEN` (لا ترقية صلاحية) | عالية | عالٍ | `requireRole` | لم تُنفَّذ |
| UAT-SEC-02 | تصعيد أفقي (كاتب آخر) | S | WRITER | مناقصة لكاتب آخر | — | `POST /:id/submit-for-approval` | `403 NOT_ASSIGNEE` | عالية | عالٍ | `tenders.ts:441` | لم تُنفَّذ |
| UAT-SEC-03 | حماية المسار المباشر | S,U | غير مخوَّل | — | فتح `/admin/users` كـQA | تصفّح مباشر للرابط | إعادة توجيه إلى `/` (ProtectedRoute) | عالية | عالٍ | `ProtectedRoute.tsx:16` | لم تُنفَّذ |
| UAT-SEC-04 | كل مسارات API محمية | S,A | زائر | — | بلا كوكي | نداء أي مسار عدا `/health`,`/ping`,`/auth/login` | `401 UNAUTHENTICATED` | عالية | عالٍ | `router.use(requireAuth)` | لم تُنفَّذ |
| UAT-SEC-05 | عدم كشف `passwordHash` | S,A | ADMIN | — | — | فحص ردود `/admin/users`,`/auth/me`,`/auth/login` | لا يظهر `passwordHash` في أي رد | عالية | عالٍ | `publicUser` select·`auth.ts:38` | لم تُنفَّذ |
| UAT-SEC-06 | مقاومة SQL Injection | S,A | QA | — | `q="' OR 1=1 --"` | `GET /tenders?q=...` | يُعامَل كنص بحث حرفي (Prisma parameterized) لا حقن | عالية | عالٍ | Prisma ORM | لم تُنفَّذ |
| UAT-SEC-07 | تخزين XSS في العنوان | S,U | QA | — | `title="<script>alert(1)</script>"` | إنشاء ثم عرض التفاصيل | يُعرَض كنص (React يهرّب المحتوى) لا تنفيذ | عالية | عالٍ | React escaping·SCR-04 | لم تُنفَّذ |
| UAT-SEC-08 | CORS مضبوط | S | — | — | أصل غير `WEB_ORIGIN` | نداء مع Origin مختلف | يُرفض/لا تُرسل رؤوس credentials للأصل غير المصرّح | متوسطة | متوسط | `app.ts:27` cors | لم تُنفَّذ |
| UAT-SEC-09 | رؤوس أمان Helmet | S | — | — | فحص الرؤوس | فحص رد أي مسار | وجود رؤوس Helmet (`X-Content-Type-Options`…) | متوسطة | متوسط | `app.ts:26` helmet | لم تُنفَّذ |
| UAT-SEC-10 | عدم تسريب Stack | S,A | — | بيئة إنتاج | خطأ مُصطنع | إحداث 500 | رسالة عامة `INTERNAL` دون Stack/تفاصيل حسّاسة | عالية | عالٍ | `errors.ts:41` | لم تُنفَّذ |
| UAT-SEC-11 | CSRF / SameSite | S | مصادَق | — | طلب POST عبر-موقعي | محاولة mutation من أصل آخر | الكوكي `SameSite=Lax` يحدّ من CSRF (لا توكن CSRF مخصص) | متوسطة | متوسط | `auth.ts:17` | لم تُنفَّذ |
| UAT-SEC-12 | تحميل مباشر بالمعرّف | S | مصادَق | مرفق لمناقصة أخرى | `attachmentId` | تحميل مباشر | `200` (سياسة معتمدة) — يُوثَّق كقرار؛ يربط `UAT-ATT-11` | عالية | عالٍ | `attachments.ts:49` | لم تُنفَّذ |
| UAT-SEC-13 | JWT secret الافتراضي | S | — | بيئة إنتاج بلا `JWT_SECRET` | — | تشغيل بلا ضبط السرّ | **عيب:** يعمل بسرّ افتراضي معروف (لا fail-fast) | عالية | عالٍ | `env.ts:17` (H0.1) | لم تُنفَّذ |
| UAT-SEC-14 | ثبات الجلسة بعد الخروج | S | مصادَق | توكن مُلتقَط | — | استخدام توكن بعد `logout` | التوكن يبقى صالحًا حتى انتهائه (لا إبطال خادمي) — يُوثَّق كقيد | متوسطة | متوسط | `auth.ts:logout` (لا denylist) | لم تُنفَّذ |

---

## 15) نقاط النظام والفحص (System & Health)

### نظرة عامة
`GET /health` (`{status:ok}`) و`POST /ping` (endpoint تجريبي M0 يعكس الرسالة بعد تحقق Zod).

### حالات الاختبار (UAT)

| UAT ID | الميزة / الهدف | النوع | الدور | المتطلبات المسبقة | بيانات الاختبار | الخطوات | النتيجة المتوقعة | أولوية | خطورة | المصدر (تتبّع) | الحالة |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-SYS-01 | فحص الصحة | P,A | زائر | الخادم يعمل | — | `GET /health` | `200 {status:"ok"}` (بلا مصادقة) | متوسطة | منخفض | `app.ts:31` | لم تُنفَّذ |
| UAT-SYS-02 | `/ping` صالح | P,A | زائر | — | `{message:"hi"}` | `POST /ping` | `200 {pong:"hi"}` | منخفضة | منخفض | `app.ts:50` | لم تُنفَّذ |
| UAT-SYS-03 | `/ping` غير صالح | N,A | زائر | — | `{}` | `POST /ping` | `422 VALIDATION` | منخفضة | منخفض | `pingSchema`·`app.ts:52` | لم تُنفَّذ |

**ملاحظة:** `/ping` endpoint تجريبي مكشوف بلا مصادقة؛ يُوصى بإزالته/تقييده في الإنتاج (انظر القيود).

---

# ملخص تغطية الـUAT (UAT Coverage Summary)

| المقياس | العدد |
|---|---|
| إجمالي الوحدات (Modules) | 15 |
| إجمالي الميزات المُقيَّمة (Features) | ~55 |
| إجمالي حالات الـUAT | **146** |
| حالات تتضمّن النوع إيجابي (P) | 60 |
| حالات تتضمّن النوع سلبي (N) | 57 |
| حالات تتضمّن النوع أمني (S) | 43 |
| حالات تتضمّن قاعدة عمل (B) | 52 |
| حالات تتضمّن API (A) | 45 |
| حالات تتضمّن الواجهة (UI) | 17 |
| حالات تتضمّن قاعدة البيانات (DB) | 29 |

> الأعداد أعلاه = **عدد الحالات التي يحمل حقل «النوع» فيها هذا الرمز** (مُحقَّقة آليًا من الجداول). معظم الحالات متعدّدة الأنواع (مثال: `UAT-APR-11` = B+N+A)، لذا مجموع الأنواع يتجاوز 146.

**توزيع الحالات على الوحدات:** المصادقة 13 · لوحة المعلومات 7 · المناقصات 20 · مراجعة QA 13 · الاعتماد والنتيجة 15 · قوالب Checklist 7 · المرفقات 11 · الإشعارات 8 · التقارير 8 · سجل العمليات 6 · إدارة المستخدمين 11 · الإعدادات 6 · مهمة الإغلاق 4 · الأمان 14 · النظام 3 = **146**.

### تغطية قواعد العمل (Business Rules)
| القاعدة | مغطّاة بـ |
|---|---|
| BR-001 (Checklist قبل التحويل) | UAT-REV-07, REV-12 |
| BR-002 (سبب الرفض إلزامي) | UAT-REV-10, APR-08 |
| BR-003 (مسؤول/كاتب واحد نشط) | UAT-REV-13, APR-02 |
| BR-004 (لا تقديم بلا اعتماد) | UAT-APR-11, APR-12 |
| BR-005 (لا إغلاق بلا نتيجة) | UAT-APR-13/14/15 |
| BR-008 (تسجيل Audit) | UAT-AUD-04, وكل حالات `*-D` |
| BR-009 (تنبيه الإغلاق) | UAT-JOB-01…04, SET-02/06 |
| BR-010 (حقول إلزامية) | UAT-TEN-03/04 |
| BR-011 (إعادة بملاحظات) | UAT-APR-06 |
| ACT-02 قفل التعديل | UAT-TEN-18 |
| NFR-005 (Audit للقراءة فقط) | UAT-AUD-03 |

### نسبة التغطية (Coverage %)
- **الإجراءات (`ACT-01…ACT-17`):** 17/17 مغطّاة = **100%**.
- **قواعد العمل النشطة (`BR-001…011` المنفّذة):** 8/8 = **100%**.
- **الشاشات (`SCR-01…SCR-09`):** 9/9 لها حالات مباشرة أو ضمنية = **100%**.
- **انتقالات الـState Machine (9 انتقالات):** 9/9 مغطّاة (إيجابي + رفض دور/حالة) = **100%**.
- **مسارات API الرئيسية:** كل مسار منفّذ له ≥1 حالة نجاح + ≥1 حالة تفويض/تحقق.

### القيود المعروفة وما هو غير منفَّذ
مذكورة صراحةً حتى لا تُختبَر كأنها موجودة:

1. **لا تسجيل ذاتي (Registration)** — المستخدمون يُنشَأون عبر ADMIN فقط.
2. **لا إعادة تعيين كلمة مرور (Password Reset)** — لا مسار/شاشة.
3. **لا تعديل ملف شخصي ذاتي (Profile)** — لا endpoint لتعديل المستخدم لنفسه.
4. **لا حذف مستخدم** — تعطيل فقط (`isActive`).
5. **الحماية الذاتية للأدمن على مستوى الـAPI غير منفّذة** — واجهية فقط (`UAT-USR-11`).
6. **تفويض تحميل/رفع المرفقات غير مقيَّد بعلاقة المناقصة** — سياسة معتمدة لكن نقطة انتباه (`UAT-ATT-11`, `UAT-SEC-12`).
7. **لا إبطال JWT/جلسات** — `logout` يمسح الكوكي فقط؛ التوكن صالح حتى انتهائه (`UAT-SEC-14`).
8. **`JWT_SECRET` بلا fail-fast** — قيمة افتراضية معروفة إن غاب المتغير (`UAT-SEC-13`).
9. **لا توكن CSRF مخصص** — الاعتماد على `SameSite=Lax` فقط (`UAT-SEC-11`).
10. **لا سياسة كلمة مرور قوية** — `min(8)` بلا تعقيد/فحص تسريب.
11. **لا `trust proxy`** — يؤثر على صحة `req.ip` وrate-limit خلف بروكسي.
12. **لا إيقاف رشيق / لا `/readyz` يفحص القاعدة** — `/health` سطحي فقط.
13. **`/ping` تجريبي مكشوف** — يُفضّل إزالته/تقييده إنتاجيًا.
14. **لا استيراد (Import) ولا وضع داكن (Dark mode)** — غير منفّذين؛ لا حالات لهما.
15. **الإشعارات بريدية غير منفّذة** — قاعدة بيانات فقط.

### توصيات UAT مستقبلية (Future Recommendations)
- إضافة حالات **أداء/حِمل** لتجميعات لوحة المعلومات/التقارير (تحميل كل الصفوف للذاكرة — `stats.ts`).
- حالات **تكامل** لدورة حياة كاملة عبر الأدوار الخمسة تسلسليًا (E2E) — يوجد أساس في `tests/e2e-lifecycle.test.ts`.
- حالات **تزامن (Concurrency)** لانتقالين متزامنين على نفس المناقصة.
- إعادة تقييم الحالات المعلَّمة كقيود أمنية بعد تنفيذ خطة التقوية `H0…H4` (`CLAUDE_CODE_PROMPT_Tender_Hardening.md`).
- بعد إغلاق `UAT-USR-11` و`UAT-SEC-13` خادميًا، تتحوّل نتائجها المتوقعة إلى «منع/رفض».

---

## سجل التغييرات (Change Log)

| الإصدار | التاريخ | التغيير |
|---|---|---|
| 1.0 | 2026-07-23 | إصدار أول لخطة UAT — 146 حالة عبر 15 وحدة، مشتقّة من تنفيذ v1.0 + تحسينات ما بعد الإصدار. |

</div>
