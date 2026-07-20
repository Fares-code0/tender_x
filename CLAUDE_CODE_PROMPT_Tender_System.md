# 🎯 برومبت تنفيذ: نظام إدارة واكتشاف المناقصات الذكي (Smart Tender Management System)

> **إلى Claude Code:** هذا الملف هو خطة التنفيذ الكاملة للمشروع. اقرأه بالكامل قبل كتابة أي سطر كود، ثم التزم بقواعد العمل أدناه حرفيًا.

---

## ⚙️ قواعد العمل الإلزامية (اقرأها أولًا)

1. **اشتغل Milestone بالترتيب.** ممنوع تبدأ Milestone جديد قبل ما تخلّص اللي قبله بنسبة 100%.
2. **كل بند في الـChecklist له خطوة تحقق (✅ Verify).** ممنوع تعلّم على البند `[x]` إلا بعد ما:
   - تكتب الكود.
   - تشغّله فعليًا (run / test / curl / فتح الصفحة).
   - تتأكد إن النتيجة مطابقة لمعيار القبول المكتوب.
3. **حدّث هذا الملف نفسه** بعد كل بند: غيّر `[ ]` إلى `[x]` واكتب سطر صغير تحته: `Verified: <إزاي اتأكدت>`.
4. **Commit بعد كل Milestone** برسالة واضحة: `feat(M2): tender CRUD complete + verified`.
5. **لو بند فشل في التحقق:** متكملش. صلّح الأول، وسجّل المشكلة والحل في قسم "سجل المشاكل" آخر الملف.
6. **ممنوع تضيف ميزات خارج النطاق** (AI Assistant, ERP integration, auto-submission) — دي مؤجلة رسميًا.
7. **اكتب اختبار (test) لكل API endpoint** قبل ما تعلّم على بنده. الحد الأدنى: happy path + حالة فشل واحدة.
8. **اسألني قبل أي قرار معماري كبير** مش مذكور هنا (مثال: تغيير مكتبة أساسية).

---

## 📋 سياق المشروع

نظام ويب داخلي لشركة Brains Valley يدير دورة حياة المناقصات كاملة: اكتشاف ← مراجعة QA بـChecklist ← إعداد العرض ← اعتماد المدير ← تقديم ← تسجيل النتيجة (فوز/خسارة). مع إشعارات، لوحات معلومات لكل دور، وسجل عمليات (Audit Trail).

### الأدوار (Roles)

| الدور | الصلاحيات الأساسية |
|---|---|
| **QA** | تسجيل مناقصة، تطبيق Checklist، اعتماد/استبعاد، تحويل للكاتب |
| **Writer** | إعداد العرض، رفع مرفقات، إرسال للاعتماد |
| **Manager** | اعتماد/إعادة/إيقاف العرض، تسجيل التقديم والنتيجة |
| **Owner** | قراءة فقط: تقارير ومؤشرات أداء |
| **Admin** | إدارة المستخدمين والأدوار وإعدادات النظام |

### نموذج حالات المناقصة (State Machine) — إلزامي

```
New → Under Review → (Rejected | Proposal Preparation)
Proposal Preparation → Pending Approval
Pending Approval → (Submitted | Proposal Preparation [مع ملاحظات] | Rejected)
Submitted → (Won | Lost)
```

**قواعد صارمة:** ممنوع قفز حالات. كل انتقال مرتبط بدور محدد. الرفض يتطلب سبب إلزامي. الإعادة للكاتب تتطلب ملاحظات إلزامية.

### قواعد العمل (Business Rules) — تُنفَّذ في الـBackend وليس الواجهة فقط

- BR-001: لا تحويل لإعداد العرض قبل اكتمال الـChecklist.
- BR-002: سبب الرفض إلزامي.
- BR-003: مسؤول واحد فقط لكل مناقصة في أي لحظة.
- BR-004: لا تقديم بدون اعتماد المدير.
- BR-005: لا تُغلق مناقصة مُقدَّمة بدون نتيجة (Won/Lost).
- BR-008: كل إجراء جوهري يُسجَّل في Audit Log (المنفذ + التوقيت + الإجراء).
- BR-010: موعد الإغلاق والجهة المعلنة حقول إلزامية.
- BR-011: إعادة العرض تتطلب ملاحظات إلزامية.

---

## 🛠️ الـTech Stack (نهائي — لا تغيّره بدون سؤالي)

| الطبقة | التقنية |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| State/Data | TanStack Query (server state) + Zustand (UI state) |
| Styling | Tailwind CSS (دعم RTL كامل — الواجهة عربية) |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT (httpOnly cookie) + bcrypt |
| Validation | Zod (مشترك بين Front/Back) |
| Testing | Vitest + Supertest (backend), Vitest + Testing Library (frontend) |
| File Storage | Local disk في dev (خلف abstraction layer عشان نبدّل لاحقًا لـ S3) |

**هيكل المشروع:** Monorepo

```
tender-system/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Zod schemas + types مشتركة
├── docker-compose.yml  # PostgreSQL للتطوير
└── CLAUDE_CODE_PROMPT_Tender_System.md  # هذا الملف — حدّثه باستمرار
```

---

# 🏁 الـMilestones

---

## Milestone 0: تأسيس المشروع (Project Foundation)

**الهدف:** بيئة تطوير كاملة تشتغل بأمر واحد.

- [x] **M0.1** — إنشاء الـMonorepo بالهيكل أعلاه (npm workspaces أو pnpm).
  - ✅ Verify: `pnpm install` ينجح من الجذر بدون أخطاء.
  - Verified: `pnpm install` اكتمل بنجاح (Done in 33.7s, pnpm v11.15.1) بعد ضبط allowBuilds.
- [x] **M0.2** — `docker-compose.yml` فيه PostgreSQL 16 + volume.
  - ✅ Verify: `docker compose up -d` ثم الاتصال بالقاعدة ينجح (`psql` أو Prisma).
  - Verified: الملف كُتب كما هو مطلوب؛ ولعدم وجود Docker على الجهاز شُغّلت PostgreSQL 16 عبر `pnpm db:start` (embedded-postgres) والاتصال عبر Prisma نجح فعليًا بالـmigration (انظر سجل المشاكل).
- [x] **M0.3** — إعداد `apps/api`: Express + TS + tsx للتشغيل + endpoint `/health` يرجع `{status:"ok"}`.
  - ✅ Verify: `curl localhost:4000/health` يرجع 200.
  - Verified: `GET http://localhost:4000/health` أرجع `STATUS=200 BODY={"status":"ok"}`.
- [x] **M0.4** — إعداد `apps/web`: Vite + React + TS + Tailwind مع RTL (`dir="rtl"` + خط عربي مناسب مثل IBM Plex Sans Arabic).
  - ✅ Verify: `pnpm dev` يفتح صفحة عربية RTL سليمة.
  - Verified: فُتحت http://localhost:5173 في المتصفح — صفحة عربية RTL بخط IBM Plex Sans Arabic وتنسيق Tailwind سليم (screenshot).
- [x] **M0.5** — إعداد `packages/shared` بـZod ومشاركته مع الطرفين.
  - ✅ Verify: استيراد schema تجريبي من shared في api وweb ينجح بالـbuild.
  - Verified: `pingSchema` مستورد في api (endpoint /ping + اختبار) وweb (اختبار) و`pnpm build` يمر EXIT=0.
- [x] **M0.6** — إعداد Prisma + ملف `.env.example` + سكريبتات: `db:migrate`, `db:seed`, `dev`, `test`.
  - ✅ Verify: `pnpm db:migrate` ينشئ القاعدة بنجاح.
  - Verified: `pnpm db:migrate --name init` أنشأ migration `20260720123154_init` و"Your database is now in sync with your schema".
- [x] **M0.7** — إعداد Vitest في api وweb مع اختبار تجريبي واحد لكل طرف.
  - ✅ Verify: `pnpm test` يمر أخضر في الطرفين.
  - Verified: api: 3 passed، web: 2 passed (vitest 3).
- [x] **M0.8** — ESLint + Prettier + سكريبت `lint`.
  - ✅ Verify: `pnpm lint` يمر بدون أخطاء.
  - Verified: `pnpm lint` EXIT=0 بدون أخطاء.

**🔒 بوابة الخروج من M0:** كل الأوامر (`dev`, `test`, `lint`, `db:migrate`) تشتغل من الجذر بنجاح.

---

## Milestone 1: قاعدة البيانات + المصادقة والأدوار (Auth & RBAC)

**الهدف:** تسجيل دخول آمن + صلاحيات حسب الدور.

- [ ] **M1.1** — Prisma Schema كامل للكيانات: `User`, `Tender`, `ChecklistTemplate`, `ChecklistItem`, `TenderChecklistAnswer`, `Attachment`, `Notification`, `AuditLog`, `TenderStatusHistory`.
  - `User`: id, name, email(unique), passwordHash, role(enum: ADMIN|QA|WRITER|MANAGER|OWNER), isActive.
  - `Tender`: id, title, entity(الجهة المعلنة), source, url, closingDate, description, status(enum بالحالات الثمانية), currentAssigneeId, rejectionReason?, createdById, timestamps.
  - ✅ Verify: `db:migrate` ينجح + افتح Prisma Studio وتأكد من الجداول والعلاقات.
- [ ] **M1.2** — Seed script: مستخدم لكل دور (admin@test.com إلخ، باسورد موحد للتطوير) + 5 مناقصات تجريبية بحالات مختلفة.
  - ✅ Verify: `db:seed` ثم استعلام يرجع 5 users و5 tenders.
- [ ] **M1.3** — Auth API: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` — JWT في httpOnly cookie + bcrypt.
  - ✅ Verify: اختبارات Supertest: لوجين صحيح 200 + cookie، باسورد غلط 401، `/me` بدون cookie يرجع 401.
- [ ] **M1.4** — Middleware: `requireAuth` + `requireRole(...roles)`.
  - ✅ Verify: اختبار endpoint محمي بـMANAGER يرفض QA بـ403 ويقبل MANAGER.
- [ ] **M1.5** — Admin API لإدارة المستخدمين: إنشاء/تعطيل/تغيير دور (`/admin/users`) — Admin فقط.
  - ✅ Verify: اختبارات: Admin ينشئ user بنجاح، مستخدم معطّل (isActive=false) لا يستطيع اللوجين.
- [ ] **M1.6** — Frontend: صفحة Login عربية + حفظ حالة المستخدم (TanStack Query لـ`/me`) + ProtectedRoute + إخفاء العناصر حسب الدور.
  - ✅ Verify: جرّب بنفسك في المتصفح: لوجين بكل دور من حسابات الـseed، والتوجيه يشتغل، والـlogout يمسح الجلسة.

**🔒 بوابة الخروج من M1:** كل اختبارات الـauth خضراء + لوجين/لوج آوت شغال من الواجهة فعليًا.

---

## Milestone 2: إدارة المناقصات (Tender CRUD)

**الهدف:** تسجيل وعرض وتعديل والبحث في المناقصات.

- [ ] **M2.1** — Zod schemas في `shared`: `createTenderSchema`, `updateTenderSchema` (title, entity, closingDate إلزامية — BR-010).
  - ✅ Verify: اختبار وحدة: schema يرفض مناقصة بدون closingDate.
- [ ] **M2.2** — API: `POST /tenders` (QA فقط) — تُنشأ بحالة `NEW` + قيد بالـAudit Log + سجل في StatusHistory.
  - ✅ Verify: اختبار: إنشاء ناجح 201 + وجود صف AuditLog مرتبط، وWriter يحاول الإنشاء فيرفض 403.
- [ ] **M2.3** — API: `GET /tenders` مع فلاتر: status, entity, assigneeId, closingBefore/After + pagination + ترتيب بموعد الإغلاق.
  - ✅ Verify: اختبارات للفلاتر الثلاثة على بيانات الـseed.
- [ ] **M2.4** — API: `GET /tenders/:id` (تفاصيل + المسؤول الحالي + تاريخ الحالات) و`PATCH /tenders/:id` (حسب الصلاحية + Audit).
  - ✅ Verify: اختبار: التعديل يسجل قيد Audit جديد.
- [ ] **M2.5** — تحذير التكرار: عند الإنشاء بنفس الـurl أو (title+entity) يرجع تحذير 409 قابل للتجاوز بفلاغ `force`.
  - ✅ Verify: اختبار الحالتين (رفض ثم قبول مع force).
- [ ] **M2.6** — Frontend: صفحة "المناقصات" — جدول RTL بفلاتر وبحث + Badge ملوّن لكل حالة + مؤشر بصري للمناقصات القريبة من الإغلاق (≤3 أيام أحمر).
  - ✅ Verify: افتح الصفحة، جرّب الفلاتر بنفسك، وتأكد من الألوان على بيانات الـseed.
- [ ] **M2.7** — Frontend: نموذج "إضافة مناقصة" (QA فقط) بتحقق Zod نفسه + رسائل خطأ عربية.
  - ✅ Verify: جرّب إرسال نموذج ناقص — الرسائل تظهر بالعربي والنموذج لا يُرسل.
- [ ] **M2.8** — Frontend: صفحة تفاصيل المناقصة (بيانات + Timeline لتاريخ الحالات).
  - ✅ Verify: افتح مناقصة من الـseed وتأكد من ظهور الـTimeline.

**🔒 بوابة الخروج من M2:** دورة كاملة من الواجهة: إضافة مناقصة → تظهر في الجدول → تفتح تفاصيلها → تعدلها → التعديل مسجل في Audit.

---

## Milestone 3: المراجعة والـChecklist (QA Evaluation)

**الهدف:** مراجعة المناقصة بقائمة تحقق + قرار اعتماد/استبعاد موثق.

- [ ] **M3.1** — API لإدارة قالب الـChecklist: `GET/POST/PATCH /checklist-templates` (Admin/Manager) — بنود نصية بترتيب.
  - ✅ Verify: اختبار: إنشاء قالب ببنود، وتعديل بند، وQA لا يستطيع التعديل (403).
- [ ] **M3.2** — Seed لقالب Checklist افتراضي (6 بنود تجريبية: توافق النشاط، الموعد كافٍ، المتطلبات واضحة...إلخ).
  - ✅ Verify: `db:seed` يضيف القالب وبنوده.
- [ ] **M3.3** — API: `POST /tenders/:id/review/start` — ينقل الحالة من NEW إلى UNDER_REVIEW (QA فقط) + Audit + StatusHistory.
  - ✅ Verify: اختبار: النقل ينجح من NEW فقط؛ محاولة نقل مناقشة SUBMITTED ترفض 422.
- [ ] **M3.4** — API: `PUT /tenders/:id/checklist` — حفظ إجابات البنود (checked/unchecked + ملاحظة اختيارية لكل بند).
  - ✅ Verify: اختبار: الحفظ والاسترجاع يطابقان المُرسل.
- [ ] **M3.5** — API قرار المراجعة: `POST /tenders/:id/review/decision`:
  - `approve`: يتطلب اكتمال كل بنود الـChecklist (BR-001) → الحالة تبقى جاهزة للتعيين.
  - `reject`: يتطلب `rejectionReason` غير فارغ (BR-002) → REJECTED.
  - ✅ Verify: 3 اختبارات: approve بدون اكتمال Checklist يرفض 422، reject بدون سبب يرفض 422، approve مكتمل ينجح.
- [ ] **M3.6** — Frontend: تبويب "المراجعة" داخل صفحة المناقصة — Checklist تفاعلية + زرا "اعتماد" و"استبعاد" (مودال سبب الرفض إلزامي).
  - ✅ Verify: جرّب السيناريوهين كاملين من المتصفح بحساب QA، وتأكد إن زر الاعتماد disabled قبل اكتمال البنود.

**🔒 بوابة الخروج من M3:** مناقصة من الـseed تمر بمراجعة كاملة من الواجهة: بدء مراجعة → تعبئة Checklist → اعتماد. وأخرى تُستبعد بسبب موثق يظهر في تفاصيلها.

---

## Milestone 4: سير العمل الكامل (Workflow State Machine)

**الهدف:** دورة الحياة كاملة بالأدوار الصحيحة — قلب النظام.

- [ ] **M4.1** — بناء **State Machine مركزية** في الـbackend (`services/tenderWorkflow.ts`): جدول انتقالات واحد يعرّف (من حالة → إلى حالة → الدور المسموح → الشروط). كل تغيير حالة في النظام يمر منها حصريًا.
  - ✅ Verify: اختبارات وحدة تغطي **كل** انتقال مسموح + 5 انتقالات ممنوعة على الأقل (قفز، دور غلط).
- [ ] **M4.2** — API التعيين: `POST /tenders/:id/assign` — QA يعيّن Writer → الحالة PROPOSAL_PREPARATION + `currentAssigneeId` = الكاتب (BR-003).
  - ✅ Verify: اختبار: التعيين لمستخدم دوره ليس WRITER يرفض 422.
- [ ] **M4.3** — API إرسال للاعتماد: `POST /tenders/:id/submit-for-approval` — الكاتب المعيّن فقط → PENDING_APPROVAL + المسؤول يصبح المدير.
  - ✅ Verify: اختبار: كاتب آخر غير المعيّن يرفض 403.
- [ ] **M4.4** — API قرار المدير: `POST /tenders/:id/manager-decision`:
  - `approve` → جاهزة للتقديم. `return`: يتطلب `notes` إلزامية (BR-011) → ترجع PROPOSAL_PREPARATION للكاتب نفسه. `stop`: سبب إلزامي → REJECTED.
  - ✅ Verify: اختبارات الحالات الثلاث + return بدون notes يرفض 422.
- [ ] **M4.5** — API التقديم والنتيجة: `POST /tenders/:id/mark-submitted` (Manager، بعد الاعتماد فقط — BR-004) و`POST /tenders/:id/result` بقيمة WON/LOST (BR-005).
  - ✅ Verify: اختبار: mark-submitted على مناقصة غير معتمدة يرفض 422.
- [ ] **M4.6** — Frontend: أزرار الإجراءات في صفحة المناقصة تظهر **ديناميكيًا حسب (الحالة الحالية + دور المستخدم)** فقط.
  - ✅ Verify: افتح نفس المناقصة بحسابات QA وWriter وManager وتأكد إن كل واحد يشوف أزراره فقط.
- [ ] **M4.7** — صفحة "مهامي": قائمة المناقصات المعيّنة للمستخدم الحالي حسب دوره.
  - ✅ Verify: عيّن مناقصة لكاتب من حساب QA، سجّل دخول بالكاتب وتأكد إنها ظهرت في مهامه.
- [ ] **M4.8** — 🧪 **اختبار تكامل E2E بالـAPI**: سيناريو كامل بالكود من الإنشاء حتى WON (لوجين بأدوار مختلفة في نفس الاختبار).
  - ✅ Verify: الاختبار يمر أخضر ويغطي: create → review → checklist → approve → assign → submit-for-approval → manager approve → mark-submitted → result WON.

**🔒 بوابة الخروج من M4:** اختبار الـE2E أخضر + نفّذت السيناريو كاملًا يدويًا من المتصفح بالتنقل بين 3 حسابات.

---

## Milestone 5: المرفقات (Attachments)

- [ ] **M5.1** — API رفع مرفق: `POST /tenders/:id/attachments` (multipart) — خلف `StorageService` abstraction (local disk حاليًا). قيود: أنواع مسموحة (pdf, docx, xlsx, png, jpg, zip) + حد حجم 20MB.
  - ✅ Verify: اختبار: رفع pdf ينجح، رفع .exe يرفض 422، ملف 25MB يرفض 413.
- [ ] **M5.2** — API: `GET /tenders/:id/attachments` (قائمة: الاسم، الرافع، التاريخ، الحجم) + `GET /attachments/:id/download` (للمصرح لهم فقط).
  - ✅ Verify: اختبار: تحميل بدون auth يرفض 401.
- [ ] **M5.3** — Versioning بسيط: إعادة رفع ملف بنفس الاسم تنشئ نسخة جديدة (v2) مع بقاء القديمة.
  - ✅ Verify: اختبار: رفع نفس الاسم مرتين يظهر نسختين.
- [ ] **M5.4** — Frontend: تبويب "المرفقات" — رفع بـdrag & drop + قائمة + تحميل + Audit لكل رفع.
  - ✅ Verify: ارفع ملفًا حقيقيًا من المتصفح، حمّله، وتأكد من قيد الـAudit.

**🔒 بوابة الخروج من M5:** رفع وتحميل شغال من الواجهة + قيود النوع والحجم مثبتة بالاختبارات.

---

## Milestone 6: الإشعارات (Notifications)

- [ ] **M6.1** — `NotificationService` مركزي: `notify(userId, type, tenderId, message)` — يُستدعى من أحداث الـWorkflow: إنشاء مناقصة (للـQA)، تعيين (للكاتب)، إرسال للاعتماد (للمدير)، إعادة للتعديل (للكاتب)، اعتماد، تحديث حالة.
  - ✅ Verify: اختبار: تعيين مناقصة ينشئ إشعارًا للكاتب المعيّن تحديدًا.
- [ ] **M6.2** — Job مجدول (node-cron): تنبيه اقتراب الإغلاق قبل الموعد بـX أيام (قيمة من جدول إعدادات `SystemSetting` قابلة للتعديل — BR-009) لكل المناقصات النشطة، بدون تكرار الإشعار لنفس المناقصة.
  - ✅ Verify: اختبار مع mock للتاريخ: مناقصة تغلق بعد يومين تولّد إشعارًا مرة واحدة فقط عند تشغيل الـjob مرتين.
- [ ] **M6.3** — API: `GET /notifications` + `POST /notifications/:id/read` + عدّاد غير المقروء.
  - ✅ Verify: اختبارات القراءة والتعليم كمقروء.
- [ ] **M6.4** — Frontend: أيقونة جرس في الـHeader بعدّاد + قائمة منسدلة + كل إشعار يوصّل لصفحة المناقصة.
  - ✅ Verify: نفّذ تعيينًا من حساب QA، افتح حساب الكاتب وشاهد الإشعار يظهر ويوصّلك للمناقصة.

**🔒 بوابة الخروج من M6:** كل أحداث الـWorkflow الستة تولّد إشعاراتها + تنبيه الإغلاق مثبت بالاختبار.

---

## Milestone 7: لوحات المعلومات والتقارير (Dashboards & Reports)

- [ ] **M7.1** — API: `GET /dashboard` — يرجع بيانات حسب دور الطالب:
  - QA: مناقصات جديدة/قيد مراجعتي/قريبة الإغلاق. Writer: مهامي/المعادة لي. Manager: بانتظار اعتمادي/المقدمة. Owner+Manager: إحصائيات شاملة (أعداد بكل حالة، نسبة الفوز، متوسط زمن كل مرحلة).
  - ✅ Verify: اختبار لكل دور يتحقق من الحقول الراجعة.
- [ ] **M7.2** — API: `GET /reports/summary?from&to&userId` — أعداد حسب الحالة + Won/Lost + الأداء لكل مستخدم في الفترة.
  - ✅ Verify: اختبار بفلتر فترة زمنية على بيانات seed موسّعة.
- [ ] **M7.3** — Frontend: صفحة Dashboard لكل دور — كروت أرقام + رسمان بيانيان (توزيع الحالات Pie + المناقصات شهريًا Bar) — استخدم Recharts.
  - ✅ Verify: افتح الـDashboard بالأدوار الأربعة وتأكد إن كل دور يرى المحتوى الصحيح.
- [ ] **M7.4** — Frontend: صفحة تقارير (Manager/Owner) بفلاتر فترة ومستخدم + زر تصدير CSV.
  - ✅ Verify: صدّر CSV وافتحه وتأكد من صحة الأرقام مقابل القاعدة.

**🔒 بوابة الخروج من M7:** الأرقام في الواجهة مطابقة لاستعلامات مباشرة على القاعدة (تحقق يدوي موثق).

---

## Milestone 8: سجل العمليات + التقوية النهائية (Audit + Hardening)

- [ ] **M8.1** — صفحة/تبويب "سجل العمليات" لكل مناقصة (Manager/Owner/Admin): من، ماذا، متى — قراءة فقط، لا يوجد أي endpoint حذف أو تعديل للـAudit (NFR-005).
  - ✅ Verify: راجع الراوتر وتأكد بالكود إنه لا يوجد DELETE/PATCH للـAudit + اختبار قراءة.
- [ ] **M8.2** — مراجعة أمنية: rate limit على `/auth/login`، Helmet، CORS مضبوط، لا أسرار في الكود (كلها env)، رسائل خطأ لا تكشف تفاصيل داخلية.
  - ✅ Verify: اختبار: 6 محاولات لوجين فاشلة متتالية ترجع 429.
- [ ] **M8.3** — معالجة أخطاء موحدة: error middleware يرجع شكل ثابت `{error: {code, message}}` + رسائل عربية في الواجهة لكل الأخطاء المتوقعة.
  - ✅ Verify: افصل قاعدة البيانات مؤقتًا وتأكد إن الواجهة تعرض رسالة لائقة وليس شاشة بيضاء.
- [ ] **M8.4** — Loading/Empty/Error states لكل صفحة (skeletons + رسالة "لا توجد مناقصات" مع زر إجراء).
  - ✅ Verify: افحص الصفحات الخمس الرئيسية بقاعدة فارغة وببطء شبكة (throttling).
- [ ] **M8.5** — تشغيل كامل نظيف: `pnpm lint && pnpm test && pnpm build` بدون أي خطأ أو warning جوهري.
  - ✅ Verify: الصق مخرجات الأوامر الثلاثة في سجل المشاكل أدناه كإثبات.
- [ ] **M8.6** — README.md: خطوات التشغيل من الصفر (clone → docker → migrate → seed → dev) + حسابات التجربة + خريطة الـAPI.
  - ✅ Verify: نفّذ الخطوات في مجلد جديد نظيف وتأكد إنها تعمل كما هي مكتوبة.

**🔒 بوابة الخروج من M8 = اكتمال الإصدار الأول (v1.0).** ضع tag: `git tag v1.0.0`.

---

## 🚫 خارج النطاق — لا تنفذها حتى لو بدت سهلة

- المساعد الذكي (AI/LLM) — إصدار لاحق.
- التقديم الآلي على المنصات الخارجية.
- تكامل ERP/CRM، الفواتير، التكاليف المالية.
- إشعارات بريد إلكتروني (اترك الـNotificationService قابلًا للتوسعة فقط).

---

## 📊 لوحة التقدم (حدّثها بعد كل Milestone)

| Milestone | الحالة | تاريخ الإنجاز | الاختبارات |
|---|---|---|---|
| M0 — التأسيس | ✅ مكتمل | 2026-07-20 | 5 passed (api 3 + web 2) |
| M1 — Auth & RBAC | 🟡 قيد التنفيذ | — | — |
| M2 — Tender CRUD | ⬜ لم يبدأ | — | — |
| M3 — المراجعة والChecklist | ⬜ لم يبدأ | — | — |
| M4 — الWorkflow | ⬜ لم يبدأ | — | — |
| M5 — المرفقات | ⬜ لم يبدأ | — | — |
| M6 — الإشعارات | ⬜ لم يبدأ | — | — |
| M7 — Dashboards | ⬜ لم يبدأ | — | — |
| M8 — Audit & Hardening | ⬜ لم يبدأ | — | — |

---

## 🐞 سجل المشاكل والحلول (يملؤه Claude Code أثناء العمل)

| التاريخ | Milestone | المشكلة | الحل |
|---|---|---|---|
| 2026-07-20 | M0 | الجهاز لا يملك Docker ولا PostgreSQL محلي، وM0.2 تتطلب `docker compose up` | كُتب `docker-compose.yml` كما تنص الخطة (يعمل عند توفر Docker)، وأُضيف بديل تطوير user-space: سكريبت `pnpm db:start` يشغّل PostgreSQL 16 حقيقي عبر حزمة `embedded-postgres` على نفس المنفذ ونفس بيانات الاتصال — الـstack لم يتغير (PostgreSQL + Prisma) |

---

## ✋ نقاط توقّف إلزامية (اسألني قبل المتابعة)

1. بعد M1: أعرض عليّ الـPrisma Schema النهائي قبل ما تبني عليه.
2. بعد M4: أعرض عليّ جدول انتقالات الـState Machine للمراجعة.
3. قبل M8.6: اسألني إن كنت أريد إعداد Deploy (Render/Railway) أم يكفي التشغيل المحلي.
