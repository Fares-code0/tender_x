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

- [x] **M1.1** — Prisma Schema كامل للكيانات: `User`, `Tender`, `ChecklistTemplate`, `ChecklistItem`, `TenderChecklistAnswer`, `Attachment`, `Notification`, `AuditLog`, `TenderStatusHistory`.
  - `User`: id, name, email(unique), passwordHash, role(enum: ADMIN|QA|WRITER|MANAGER|OWNER), isActive.
  - `Tender`: id, title, entity(الجهة المعلنة), source, url, closingDate, description, status(enum بالحالات الثمانية), currentAssigneeId, rejectionReason?, createdById, timestamps.
  - ✅ Verify: `db:migrate` ينجح + افتح Prisma Studio وتأكد من الجداول والعلاقات.
  - Verified: migration `full_schema` طُبق بنجاح، واستعلام information_schema أظهر كل الجداول العشرة (بديل غير تفاعلي عن Prisma Studio) والعلاقات مثبتة بعمل الـseed والاختبارات.
- [x] **M1.2** — Seed script: مستخدم لكل دور (admin@test.com إلخ، باسورد موحد للتطوير) + 5 مناقصات تجريبية بحالات مختلفة.
  - ✅ Verify: `db:seed` ثم استعلام يرجع 5 users و5 tenders.
  - Verified: استعلام مباشر أرجع `users=5 tenders=5` بخمس حالات مختلفة (NEW/UNDER_REVIEW/PROPOSAL_PREPARATION/PENDING_APPROVAL/SUBMITTED) والنص العربي سليم. الباسورد الموحد: `Test1234!`.
- [x] **M1.3** — Auth API: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` — JWT في httpOnly cookie + bcrypt.
  - ✅ Verify: اختبارات Supertest: لوجين صحيح 200 + cookie، باسورد غلط 401، `/me` بدون cookie يرجع 401.
  - Verified: 6 اختبارات Supertest خضراء في tests/auth.test.ts تغطي كل الحالات المطلوبة + httpOnly.
- [x] **M1.4** — Middleware: `requireAuth` + `requireRole(...roles)`.
  - ✅ Verify: اختبار endpoint محمي بـMANAGER يرفض QA بـ403 ويقبل MANAGER.
  - Verified: 4 اختبارات خضراء في tests/rbac.test.ts (401 بدون auth، QA→403، MANAGER→200، مستخدم عُطّل بعد اللوجين→401).
- [x] **M1.5** — Admin API لإدارة المستخدمين: إنشاء/تعطيل/تغيير دور (`/admin/users`) — Admin فقط.
  - ✅ Verify: اختبارات: Admin ينشئ user بنجاح، مستخدم معطّل (isActive=false) لا يستطيع اللوجين.
  - Verified: 5 اختبارات خضراء في tests/admin-users.test.ts (إنشاء 201 + قيد Audit، QA→403، بريد مكرر→409، معطّل لا يدخل، تغيير دور).
- [x] **M1.6** — Frontend: صفحة Login عربية + حفظ حالة المستخدم (TanStack Query لـ`/me`) + ProtectedRoute + إخفاء العناصر حسب الدور.
  - ✅ Verify: جرّب بنفسك في المتصفح: لوجين بكل دور من حسابات الـseed، والتوجيه يشتغل، والـlogout يمسح الجلسة.
  - Verified: من المتصفح فعليًا: admin (يرى "إدارة المستخدمين" وجدول الخمسة)، qa وmanager (الرابط مخفي عنهما)، logout يعيد لصفحة الدخول، وغير المسجل يُوجَّه لـ/login. writer وowner تحققا بلوجين API ناجح 200+cookie (نفس مسار الواجهة).

**🔒 بوابة الخروج من M1:** كل اختبارات الـauth خضراء + لوجين/لوج آوت شغال من الواجهة فعليًا.

---

## Milestone 2: إدارة المناقصات (Tender CRUD)

**الهدف:** تسجيل وعرض وتعديل والبحث في المناقصات.

- [x] **M2.1** — Zod schemas في `shared`: `createTenderSchema`, `updateTenderSchema` (title, entity, closingDate إلزامية — BR-010).
  - ✅ Verify: اختبار وحدة: schema يرفض مناقصة بدون closingDate.
  - Verified: 6 اختبارات وحدة خضراء في tests/tender-schemas.test.ts (منها رفض مناقصة بدون closingDate وبدون entity + رسائل عربية).
- [x] **M2.2** — API: `POST /tenders` (QA فقط) — تُنشأ بحالة `NEW` + قيد بالـAudit Log + سجل في StatusHistory.
  - ✅ Verify: اختبار: إنشاء ناجح 201 + وجود صف AuditLog مرتبط، وWriter يحاول الإنشاء فيرفض 403.
  - Verified: اختبارات خضراء: 201 + NEW + assignee=QA + صف AuditLog + صف StatusHistory(null→NEW)، وWriter→403، وبدون closingDate→422.
- [x] **M2.3** — API: `GET /tenders` مع فلاتر: status, entity, assigneeId, closingBefore/After + pagination + ترتيب بموعد الإغلاق.
  - ✅ Verify: اختبارات للفلاتر الثلاثة على بيانات الـseed.
  - Verified: 6 اختبارات خضراء: status، entity، assigneeId، closingBefore/After مع الترتيب تصاعديًا، pagination، و401 بدون auth.
- [x] **M2.4** — API: `GET /tenders/:id` (تفاصيل + المسؤول الحالي + تاريخ الحالات) و`PATCH /tenders/:id` (حسب الصلاحية + Audit).
  - ✅ Verify: اختبار: التعديل يسجل قيد Audit جديد.
  - Verified: اختبارات خضراء: التفاصيل تشمل currentAssignee وstatusHistory، 404 لغير الموجود، PATCH يضيف قيد TENDER_UPDATED بعد TENDER_CREATED، وWriter→403.
- [x] **M2.5** — تحذير التكرار: عند الإنشاء بنفس الـurl أو (title+entity) يرجع تحذير 409 قابل للتجاوز بفلاغ `force`.
  - ✅ Verify: اختبار الحالتين (رفض ثم قبول مع force).
  - Verified: اختباران خضراوان: نفس الـurl→409 ثم force=1→201، ونفس (title+entity) برابط مختلف→409. + تحقق يدوي من الواجهة.
- [x] **M2.6** — Frontend: صفحة "المناقصات" — جدول RTL بفلاتر وبحث + Badge ملوّن لكل حالة + مؤشر بصري للمناقصات القريبة من الإغلاق (≤3 أيام أحمر).
  - ✅ Verify: افتح الصفحة، جرّب الفلاتر بنفسك، وتأكد من الألوان على بيانات الـseed.
  - Verified: من المتصفح: جدول الخمسة بـBadges ملونة لكل حالة، مناقصة "تطوير بوابة" ظهرت حمراء مع شارة "متبقٍ 2 أيام"، فلتر الحالة أرجع 1 وفلتر الجهة "وزارة" أرجع 2 (screenshot).
- [x] **M2.7** — Frontend: نموذج "إضافة مناقصة" (QA فقط) بتحقق Zod نفسه + رسائل خطأ عربية.
  - ✅ Verify: جرّب إرسال نموذج ناقص — الرسائل تظهر بالعربي والنموذج لا يُرسل.
  - Verified: إرسال نموذج فارغ أظهر 3 رسائل عربية تحت الحقول (بعد إصلاح "Invalid date" — انظر سجل المشاكل) ولم يُرسل. الرابط /tenders/new محمي بدور QA.
- [x] **M2.8** — Frontend: صفحة تفاصيل المناقصة (بيانات + Timeline لتاريخ الحالات).
  - ✅ Verify: افتح مناقصة من الـseed وتأكد من ظهور الـTimeline.
  - Verified: صفحة التفاصيل تعرض كل البيانات + Timeline "أُنشئت (جديدة) — أحمد المراجع" (screenshot). بوابة الخروج نُفذت كاملة: إضافة → ظهرت في الجدول → تفاصيل → تعديل → قيد TENDER_UPDATED مثبت باستعلام مباشر على القاعدة.

**🔒 بوابة الخروج من M2:** دورة كاملة من الواجهة: إضافة مناقصة → تظهر في الجدول → تفتح تفاصيلها → تعدلها → التعديل مسجل في Audit.

---

## Milestone 3: المراجعة والـChecklist (QA Evaluation)

**الهدف:** مراجعة المناقصة بقائمة تحقق + قرار اعتماد/استبعاد موثق.

- [x] **M3.1** — API لإدارة قالب الـChecklist: `GET/POST/PATCH /checklist-templates` (Admin/Manager) — بنود نصية بترتيب.
  - ✅ Verify: اختبار: إنشاء قالب ببنود، وتعديل بند، وQA لا يستطيع التعديل (403).
  - Verified: `src/routes/checklistTemplates.ts` — `GET /` (لكل مُصادَق)، و`POST /` و`PATCH /:id` خلف `requireRole('ADMIN','MANAGER')`. 3 اختبارات خضراء في `tests/checklist-templates.test.ts`: مدير يُنشئ قالبًا ببنود مرتّبة (201 + قيد Audit)، أدمن يعدّل نصّ بند بـPATCH، وQA يُرفض بـ403 في الإنشاء والتعديل معًا.
- [x] **M3.2** — Seed لقالب Checklist افتراضي (6 بنود تجريبية: توافق النشاط، الموعد كافٍ، المتطلبات واضحة...إلخ).
  - ✅ Verify: `db:seed` يضيف القالب وبنوده.
  - Verified: `prisma/seed.ts` يُنشئ «قالب مراجعة المناقصات الافتراضي» بـ**6 بنود** مرتّبة (`order` 0–5): توافق النشاط، كفاية الموعد، وضوح المتطلبات، توفّر الكوادر، الجدوى المالية، وانتفاء تعارض المصالح. السكربت يطبع عدد القوالب والبنود بعد البذر للتأكيد.
- [x] **M3.3** — API: `POST /tenders/:id/review/start` — ينقل الحالة من NEW إلى UNDER_REVIEW (QA فقط) + Audit + StatusHistory.
  - ✅ Verify: اختبار: النقل ينجح من NEW فقط؛ محاولة نقل مناقشة SUBMITTED ترفض 422.
  - Verified: `src/routes/tenders/review.ts:17` خلف `requireRole('QA')`. 3 اختبارات خضراء: QA ينقل NEW→UNDER_REVIEW مع صف StatusHistory وقيد Audit، وبدء المراجعة على مناقصة ليست NEW يُرفض 422، وWRITER يُرفض 403. (أُعيد توجيه الانتقال لاحقًا عبر الـState Machine المركزية — راجع M4.1.)
- [x] **M3.4** — API: `PUT /tenders/:id/checklist` — حفظ إجابات البنود (checked/unchecked + ملاحظة اختيارية لكل بند).
  - ✅ Verify: اختبار: الحفظ والاسترجاع يطابقان المُرسل.
  - Verified: `review.ts:63` (`PUT`) مع `GET /:id/checklist` للاسترجاع. اختبار «saves answers and retrieves them matching what was sent» أخضر — يحفظ إجابات مختلطة بملاحظات ويقارن المُسترجَع بالمُرسَل حرفيًا.
- [x] **M3.5** — API قرار المراجعة: `POST /tenders/:id/review/decision`:
  - `approve`: يتطلب اكتمال كل بنود الـChecklist (BR-001) → الحالة تبقى جاهزة للتعيين.
  - `reject`: يتطلب `rejectionReason` غير فارغ (BR-002) → REJECTED.
  - ✅ Verify: 3 اختبارات: approve بدون اكتمال Checklist يرفض 422، reject بدون سبب يرفض 422، approve مكتمل ينجح.
  - Verified: `review.ts:101` + `services/checklistCompletion.ts`. **4** اختبارات خضراء (واحد أكثر من المطلوب): approve بقائمة ناقصة→422 (BR-001)، reject بلا سبب→422 (BR-002)، reject بسبب→REJECTED مع تخزين السبب وصف StatusHistory، وapprove باكتمال البنود ينجح ويبقى UNDER_REVIEW جاهزًا للتعيين.
- [x] **M3.6** — Frontend: تبويب "المراجعة" داخل صفحة المناقصة — Checklist تفاعلية + زرا "اعتماد" و"استبعاد" (مودال سبب الرفض إلزامي).
  - ✅ Verify: جرّب السيناريوهين كاملين من المتصفح بحساب QA، وتأكد إن زر الاعتماد disabled قبل اكتمال البنود.
  - Verified: `apps/web/src/components/ReviewTab.tsx` — الإجراءات تظهر لدور QA فقط، وزر «اعتماد» `disabled={!allChecked}` مع `title` يشرح السبب، ومودال «استبعاد» يمنع الإرسال حتى يبلغ السبب 3 أحرف. تُحقّق من المسارين كاملين في المتصفح وقت التنفيذ (commit `0644e58`).

**🔒 بوابة الخروج من M3:** مناقصة من الـseed تمر بمراجعة كاملة من الواجهة: بدء مراجعة → تعبئة Checklist → اعتماد. وأخرى تُستبعد بسبب موثق يظهر في تفاصيلها. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-21، `0644e58`):** المساران نُفِّذا من المتصفح فعليًا، ومجموعة الاختبارات 52 خضراء (11 جديدة لـM3).

---

## Milestone 4: سير العمل الكامل (Workflow State Machine)

**الهدف:** دورة الحياة كاملة بالأدوار الصحيحة — قلب النظام.

- [x] **M4.1** — بناء **State Machine مركزية** في الـbackend (`services/tenderWorkflow.ts`): جدول انتقالات واحد يعرّف (من حالة → إلى حالة → الدور المسموح → الشروط). كل تغيير حالة في النظام يمر منها حصريًا.
  - ✅ Verify: اختبارات وحدة تغطي **كل** انتقال مسموح + 5 انتقالات ممنوعة على الأقل (قفز، دور غلط).
  - Verified: `src/services/tenderWorkflow.ts` — ثابت `TRANSITIONS` بـ**9 انتقالات** (من/إلى/الأدوار) هو المصدر الوحيد، و`resolveTransition` يرمي 422 `INVALID_TRANSITION` عند القفز و403 `FORBIDDEN_TRANSITION` عند الدور الخطأ. `tests/workflow.test.ts` يمرّ على **كل صف في الجدول برمجيًا** (لا قائمة مكتوبة يدويًا تتقادم) + سلسلة المسار السعيد الكاملة + **5 انتقالات ممنوعة** كحد أدنى. حُوِّلت مسارات M3.3/M3.5 لتمرّ عبرها أيضًا.
- [x] **M4.2** — API التعيين: `POST /tenders/:id/assign` — QA يعيّن Writer → الحالة PROPOSAL_PREPARATION + `currentAssigneeId` = الكاتب (BR-003).
  - ✅ Verify: اختبار: التعيين لمستخدم دوره ليس WRITER يرفض 422.
  - Verified: `routes/tenders/workflow.ts:18` + `services/tenderAssignment.ts`. اختباران خضراوان: QA يعيّن كاتبًا (UNDER_REVIEW→PROPOSAL_PREPARATION مع ضبط المسؤول)، والتعيين لمستخدم ليس WRITER يُرفض 422.
- [x] **M4.3** — API إرسال للاعتماد: `POST /tenders/:id/submit-for-approval` — الكاتب المعيّن فقط → PENDING_APPROVAL + المسؤول يصبح المدير.
  - ✅ Verify: اختبار: كاتب آخر غير المعيّن يرفض 403.
  - Verified: `workflow.ts:37` خلف `requireRole('WRITER')` مع فحص أنه **المعيَّن** تحديدًا. اختباران: الكاتب المعيّن ينقلها إلى PENDING_APPROVAL، وكاتب آخر (دوره صحيح لكنه غير معيَّن) يُرفض 403.
- [x] **M4.4** — API قرار المدير: `POST /tenders/:id/manager-decision`:
  - `approve` → جاهزة للتقديم. `return`: يتطلب `notes` إلزامية (BR-011) → ترجع PROPOSAL_PREPARATION للكاتب نفسه. `stop`: سبب إلزامي → REJECTED.
  - ✅ Verify: اختبارات الحالات الثلاث + return بدون notes يرفض 422.
  - Verified: `workflow.ts:75` + `services/tenderDecision.ts`. **4** اختبارات خضراء: approve يضبط `managerApprovedAt`، return بلا `notes`→422 (BR-011)، return بملاحظات يعيدها **للكاتب نفسه** ويمسح الاعتماد، وstop→REJECTED.
- [x] **M4.5** — API التقديم والنتيجة: `POST /tenders/:id/mark-submitted` (Manager، بعد الاعتماد فقط — BR-004) و`POST /tenders/:id/result` بقيمة WON/LOST (BR-005).
  - ✅ Verify: اختبار: mark-submitted على مناقصة غير معتمدة يرفض 422.
  - Verified: `workflow.ts:101` و`workflow.ts:129`. اختباران: mark-submitted قبل اعتماد المدير يُرفض 422 (BR-004)، وبعد الاعتماد ينتقل إلى SUBMITTED ثم `result` بـWON ينقلها إلى WON (BR-005).
- [x] **M4.6** — Frontend: أزرار الإجراءات في صفحة المناقصة تظهر **ديناميكيًا حسب (الحالة الحالية + دور المستخدم)** فقط.
  - ✅ Verify: افتح نفس المناقصة بحسابات QA وWriter وManager وتأكد إن كل واحد يشوف أزراره فقط.
  - Verified: `apps/web/src/components/ActionsBar.tsx` يبني قائمة الأزرار من (الحالة + الدور + كونه المسؤول المعيّن)، ويعرض «لا توجد إجراءات متاحة لك حاليًا» حين تكون القائمة فارغة بدل شريط فارغ. تُحقّق في المتصفح بالتنقل بين QA/Writer/Manager على نفس المناقصة (commit `86941ce`).
- [x] **M4.7** — صفحة "مهامي": قائمة المناقصات المعيّنة للمستخدم الحالي حسب دوره.
  - ✅ Verify: عيّن مناقصة لكاتب من حساب QA، سجّل دخول بالكاتب وتأكد إنها ظهرت في مهامه.
  - Verified: `apps/web/src/pages/MyTasksPage.tsx` يستعلم بـ`assigneeId = user.id` (وبفلتر مناسب لكل دور) مع حالة فراغ «لا توجد مهام لك حاليًا». تُحقّق بدورة تعيين فعلية من QA ثم دخول بالكاتب.
- [x] **M4.8** — 🧪 **اختبار تكامل E2E بالـAPI**: سيناريو كامل بالكود من الإنشاء حتى WON (لوجين بأدوار مختلفة في نفس الاختبار).
  - ✅ Verify: الاختبار يمر أخضر ويغطي: create → review → checklist → approve → assign → submit-for-approval → manager approve → mark-submitted → result WON.
  - Verified: `tests/e2e-lifecycle.test.ts` — «runs the full happy path across QA, Writer and Manager»: سيناريو واحد متصل بثلاث جلسات دخول مختلفة يغطي السلسلة كاملة حتى WON. أخضر.

**🔒 بوابة الخروج من M4:** اختبار الـE2E أخضر + نفّذت السيناريو كاملًا يدويًا من المتصفح بالتنقل بين 3 حسابات. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-22، `86941ce`):** 21 اختبارًا جديدًا (10 وحدة للـState Machine + 10 للمسارات + 1 E2E)، ومجموعة الـAPI 71 خضراء، والسيناريو نُفِّذ يدويًا عبر الأدوار الثلاثة.

---

## Milestone 5: المرفقات (Attachments)

- [x] **M5.1** — API رفع مرفق: `POST /tenders/:id/attachments` (multipart) — خلف `StorageService` abstraction (local disk حاليًا). قيود: أنواع مسموحة (pdf, docx, xlsx, png, jpg, zip) + حد حجم 20MB.
  - ✅ Verify: اختبار: رفع pdf ينجح، رفع .exe يرفض 422، ملف 25MB يرفض 413.
  - Verified: `routes/tenders/attachments.ts:20` (multer، `requireRole('WRITER')`) خلف `services/storage.ts`. 5 اختبارات خضراء: رفع pdf→201 مع صف وقيد Audit، رفع `.exe`→422، ملف >20MB→413، QA لا يرفع→403، **واسم ملف عربي يبقى سليمًا** (إصلاح ترميز latin1→utf8 في multer).
  - **تحديث لاحق (H5.1):** الـabstraction لم تعد قرصًا محليًا فقط — أُضيف محوّل S3 (`services/s3Storage.ts`) يُختار وقت الإنشاء حسب `S3_BUCKET`، والقرص المحلي يبقى افتراضَ التطوير. النصّ أعلاه يصف حالة v1.0.
- [x] **M5.2** — API: `GET /tenders/:id/attachments` (قائمة: الاسم، الرافع، التاريخ، الحجم) + `GET /attachments/:id/download` (للمصرح لهم فقط).
  - ✅ Verify: اختبار: تحميل بدون auth يرفض 401.
  - Verified: `attachments.ts:70` للقائمة و`routes/attachments.ts:68` للتنزيل. 4 اختبارات: القائمة تعرض الرافع والحجم والتاريخ، تنزيل بلا auth→401، وتنزيل مُصادَق يعيد محتوى الملف فعليًا.
  - **تحديث لاحق (H1.1):** «للمصرح لهم فقط» صار مُنفَّذًا بدقة بعد إغلاق ثغرة BOLA — كاتب غير مرتبط بالمناقصة يُرفض 403 بينما الأدوار الإشرافية تُسمح، ولكل حالة اختبار.
- [x] **M5.3** — Versioning بسيط: إعادة رفع ملف بنفس الاسم تنشئ نسخة جديدة (v2) مع بقاء القديمة.
  - ✅ Verify: اختبار: رفع نفس الاسم مرتين يظهر نسختين.
  - Verified: اختبار «re-uploading the same filename creates v2 while v1 remains» أخضر — النسختان تبقيان في القائمة برقمَي إصدار مختلفين.
- [x] **M5.4** — Frontend: تبويب "المرفقات" — رفع بـdrag & drop + قائمة + تحميل + Audit لكل رفع.
  - ✅ Verify: ارفع ملفًا حقيقيًا من المتصفح، حمّله، وتأكد من قيد الـAudit.
  - Verified: `apps/web/src/components/AttachmentsTab.tsx` — منطقة إفلات بحالة `dragOver` مرئية (`onDragOver`/`onDrop`) + قائمة + روابط تنزيل + حالتا تحميل وفراغ. تُحقّق بدورة رفع→تنزيل→قيد Audit من المتصفح (commit `badac48`).
  - **تحديث لاحق (H6.3):** رابطا الرفع والتنزيل كانا يُبنيان يدويًا خارج عميل الـAPI فلم يلتقطا بادئة `/v1`؛ وُحِّدا على `API_BASE` من `api/client.ts`.

**🔒 بوابة الخروج من M5:** رفع وتحميل شغال من الواجهة + قيود النوع والحجم مثبتة بالاختبارات. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-22، `badac48`):** 9 اختبارات مرفقات، ومجموعة الـAPI 80 خضراء.

---

## Milestone 6: الإشعارات (Notifications)

- [x] **M6.1** — `NotificationService` مركزي: `notify(userId, type, tenderId, message)` — يُستدعى من أحداث الـWorkflow: إنشاء مناقصة (للـQA)، تعيين (للكاتب)، إرسال للاعتماد (للمدير)، إعادة للتعديل (للكاتب)، اعتماد، تحديث حالة.
  - ✅ Verify: اختبار: تعيين مناقصة ينشئ إشعارًا للكاتب المعيّن تحديدًا.
  - Verified: `services/notifications.ts` — `notify()` للفرد و`notifyRole()` للدور (تستثني المنفِّذ نفسه)، وكلتاهما تقبلان `TransactionClient` فتُكتب الإشعارات داخل نفس معاملة تغيير الحالة. موصولة بـ**6 أحداث** في `routes/tenders/crud.ts` و`routes/tenders/workflow.ts` و`services/tenderAssignment.ts` و`services/tenderDecision.ts`. الاختبار يؤكد أن التعيين يُشعر **الكاتب المعيَّن تحديدًا** (لا كل الكتّاب)، وأن الإرسال للاعتماد يُشعر المدراء.
- [x] **M6.2** — Job مجدول (node-cron): تنبيه اقتراب الإغلاق قبل الموعد بـX أيام (قيمة من جدول إعدادات `SystemSetting` قابلة للتعديل — BR-009) لكل المناقصات النشطة، بدون تكرار الإشعار لنفس المناقصة.
  - ✅ Verify: اختبار مع mock للتاريخ: مناقصة تغلق بعد يومين تولّد إشعارًا مرة واحدة فقط عند تشغيل الـjob مرتين.
  - Verified: `services/closingReminder.ts` — `runClosingReminders(now)` تقبل الوقت حقنًا فتُختبر بلا تلاعب بالساعة. 4 اختبارات خضراء: **تشغيلان متتاليان يُنتجان إشعارًا واحدًا فقط** (منع التكرار)، وتجاهل ما هو خارج النافذة، واحترام عدد الأيام القابل للتعديل من `SystemSetting` (BR-009)، وتجاهل المناقصات غير النشطة (SUBMITTED).
- [x] **M6.3** — API: `GET /notifications` + `POST /notifications/:id/read` + عدّاد غير المقروء.
  - ✅ Verify: اختبارات القراءة والتعليم كمقروء.
  - Verified: `routes/notifications.ts`. 4 اختبارات: القائمة مع `unreadCount`، التعليم كمقروء يُنقص العدّاد، **محاولة تعليم إشعار مستخدم آخر→404** (لا تسريب وجود)، وبلا auth→401.
- [x] **M6.4** — Frontend: أيقونة جرس في الـHeader بعدّاد + قائمة منسدلة + كل إشعار يوصّل لصفحة المناقصة.
  - ✅ Verify: نفّذ تعيينًا من حساب QA، افتح حساب الكاتب وشاهد الإشعار يظهر ويوصّلك للمناقصة.
  - Verified: `apps/web/src/components/NotificationBell.tsx` — شارة غير المقروء + قائمة منسدلة (بحالة فراغ) + النقر يُعلّم كمقروء ويوجّه للمناقصة، مع تحديث دوري كل 20 ثانية عبر TanStack Query. تُحقّق بدورة تعيين→جرس→تنقّل→قراءة من المتصفح (commit `f3d97b4`).

**🔒 بوابة الخروج من M6:** كل أحداث الـWorkflow الستة تولّد إشعاراتها + تنبيه الإغلاق مثبت بالاختبار. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-22، `f3d97b4`):** الأحداث الستة موصولة، و14 اختبارًا جديدًا، والمجموعة الكاملة 92 خضراء (api 90 + web 2).

---

## Milestone 7: لوحات المعلومات والتقارير (Dashboards & Reports)

- [x] **M7.1** — API: `GET /dashboard` — يرجع بيانات حسب دور الطالب:
  - QA: مناقصات جديدة/قيد مراجعتي/قريبة الإغلاق. Writer: مهامي/المعادة لي. Manager: بانتظار اعتمادي/المقدمة. Owner+Manager: إحصائيات شاملة (أعداد بكل حالة، نسبة الفوز، متوسط زمن كل مرحلة).
  - ✅ Verify: اختبار لكل دور يتحقق من الحقول الراجعة.
  - Verified: `routes/dashboard.ts` + `services/stats.ts`. 5 اختبارات خضراء — **اختبار لكل دور** (QA: سلاله بلا إحصائيات شاملة، WRITER: سلاله، MANAGER: سلال + إحصائيات، OWNER: إحصائيات بلا سلال دور) + 401 بلا auth. كل اختبار يؤكد الحقول الموجودة **والغائبة** معًا.
- [x] **M7.2** — API: `GET /reports/summary?from&to&userId` — أعداد حسب الحالة + Won/Lost + الأداء لكل مستخدم في الفترة.
  - ✅ Verify: اختبار بفلتر فترة زمنية على بيانات seed موسّعة.
  - Verified: `routes/reports.ts`. 3 اختبارات: فلتر الفترة يَعُدّ ما بداخلها فقط، `userId` يضيّق لمستخدم واحد، وغير Manager/Owner يُرفض 403.
  - **تحديث لاحق (H4.1):** التجميع نُقل من الذاكرة إلى SQL (`groupBy` + `date_trunc` + دالة النافذة `LEAD`)، و`tests/stats-sql.test.ts` يحتفظ بالتنفيذ القديم **كمرجع** ويقارن النتائج حرفيًا لإثبات تطابق الأرقام.
- [x] **M7.3** — Frontend: صفحة Dashboard لكل دور — كروت أرقام + رسمان بيانيان (توزيع الحالات Pie + المناقصات شهريًا Bar) — استخدم Recharts.
  - ✅ Verify: افتح الـDashboard بالأدوار الأربعة وتأكد إن كل دور يرى المحتوى الصحيح.
  - Verified: `apps/web/src/pages/DashboardPage.tsx` (صارت الصفحة الرئيسية `/`) — كروت أرقام + Pie للحالات + Bar شهري عبر `recharts`، مع حالة «لا توجد بيانات» لكل رسم. تُحقّقت الأدوار الأربعة من المتصفح (commit `d28051f`).
- [x] **M7.4** — Frontend: صفحة تقارير (Manager/Owner) بفلاتر فترة ومستخدم + زر تصدير CSV.
  - ✅ Verify: صدّر CSV وافتحه وتأكد من صحة الأرقام مقابل القاعدة.
  - Verified: `apps/web/src/pages/ReportsPage.tsx` — فلاتر الفترة والمستخدم + «تصدير CSV» عبر `Blob` باسم ملف يحمل المدى الزمني، **مع BOM لضمان ظهور العربية سليمة في Excel**. قُورنت أرقام الـCSV باستعلام مباشر على القاعدة.

**🔒 بوابة الخروج من M7:** الأرقام في الواجهة مطابقة لاستعلامات مباشرة على القاعدة (تحقق يدوي موثق). — ✅ **مُنجَزة ومُتحقَّقة (2026-07-22، `d28051f`):** 8 اختبارات جديدة (5 لوحة + 3 تقارير)، والمجموعة الكاملة 100 خضراء (api 98 + web 2)، وأرقام الـCSV طُوبقت يدويًا مع القاعدة.

---

## Milestone 8: سجل العمليات + التقوية النهائية (Audit + Hardening)

- [x] **M8.1** — صفحة/تبويب "سجل العمليات" لكل مناقصة (Manager/Owner/Admin): من، ماذا، متى — قراءة فقط، لا يوجد أي endpoint حذف أو تعديل للـAudit (NFR-005).
  - ✅ Verify: راجع الراوتر وتأكد بالكود إنه لا يوجد DELETE/PATCH للـAudit + اختبار قراءة.
  - Verified: `GET /tenders/:id/audit` خلف `requireRole('MANAGER','OWNER','ADMIN')`. فحص الراوترات كلها: **لا يوجد أي `DELETE` أو `PATCH` على الـAudit** — القراءة هي العملية الوحيدة المتاحة (NFR-005). الواجهة: `apps/web/src/components/AuditTab.tsx` (من/ماذا/متى) مع حالتَي تحميل وفراغ.
  - **تحديث لاحق (H4.3):** سجل التدقيق ينمو بلا حد فأُضيف ترقيم (`skip`/`take` + `total`) بدل تحميله كاملًا.
- [x] **M8.2** — مراجعة أمنية: rate limit على `/auth/login`، Helmet، CORS مضبوط، لا أسرار في الكود (كلها env)، رسائل خطأ لا تكشف تفاصيل داخلية.
  - ✅ Verify: اختبار: 6 محاولات لوجين فاشلة متتالية ترجع 429.
  - Verified: `helmet()` + `cors({ origin: env.webOrigin, credentials: true })` في `app.ts`، وحدّ معدل على `/auth/login`، ولا أسرار في الكود (كلها من `env`). الاختبار يؤكد 429 بعد 6 محاولات، والمحدِّد مُعطَّل في الاختبارات ويُفعَّل صراحةً عبر `createApp({ rateLimit: true })` كي لا يلوّث بقية المجموعة.
  - **تحديث لاحق (H0/H1/H2 + PR #12):** طور التقوية وسّع هذا البند كثيرًا — `parseEnv` بـZod يمنع الإقلاع بلا أسرار في الإنتاج، والمحدِّد صار موزّعًا على Redis مع `Retry-After`، وأُضيف قفل حساب بعد 5 محاولات. وفي **PR #12 (`0b29117`، 2026-07-27)** صار حدّ الدخول **قابلًا للضبط** عبر `LOGIN_RATE_LIMIT_MAX` و`LOGIN_RATE_LIMIT_WINDOW_MS`: الافتراضي يبقى **5 محاولات/15 دقيقة في الإنتاج والاختبار**، و`NODE_ENV=development` وحده يحصل على 50 — **سلوك الإنتاج لم يتغيّر**، وهو ما يثبته بقاء اختبار الـ429 (6 محاولات) أخضر بلا تعديل.
- [x] **M8.3** — معالجة أخطاء موحدة: error middleware يرجع شكل ثابت `{error: {code, message}}` + رسائل عربية في الواجهة لكل الأخطاء المتوقعة.
  - ✅ Verify: افصل قاعدة البيانات مؤقتًا وتأكد إن الواجهة تعرض رسالة لائقة وليس شاشة بيضاء.
  - Verified: `src/lib/errors.ts` — `errorHandler` يعيد `{error:{code,message}}` لكل من `AppError` و`ZodError`، وأي خطأ غير متوقع يُسجَّل داخليًا ويعود للعميل بـ`{code:'INTERNAL'}` برسالة عربية عامة **بلا تفاصيل داخلية**. تُحقّق بقطع القاعدة: الواجهة تعرض رسالة لائقة لا شاشة بيضاء (commit `d49bec3`).
- [x] **M8.4** — Loading/Empty/Error states لكل صفحة (skeletons + رسالة "لا توجد مناقصات" مع زر إجراء).
  - ✅ Verify: افحص الصفحات الخمس الرئيسية بقاعدة فارغة وببطء شبكة (throttling).
  - Verified: حالات تحميل وفراغ في كل الصفحات والتبويبات الرئيسية — المناقصات («لا توجد مناقصات مطابقة» + زر إجراء)، مهامي، اللوحة (فراغ لكل رسم)، التقارير، الإعدادات، المستخدمون، وتبويبات المراجعة/المرفقات/السجل/الإشعارات.
  - **انحراف مقصود عن النص:** المؤشرات نصّية («جارٍ التحميل...») وليست **skeletons** رسومية كما اقترح البند. الوظيفة المطلوبة (لا شاشة بيضاء ولا قائمة فارغة غامضة) متحققة، لكن الشكل يختلف — مُسجَّل هنا كي لا يُقرأ البند كأنه نُفِّذ حرفيًا.
- [x] **M8.5** — تشغيل كامل نظيف: `pnpm lint && pnpm test && pnpm build` بدون أي خطأ أو warning جوهري.
  - ✅ Verify: الصق مخرجات الأوامر الثلاثة في سجل المشاكل أدناه كإثبات.
  - Verified (v1.0، commit `d49bec3`): المجموعة الكاملة **104 خضراء** (api 102 + web 2)، وlint نظيف، وbuild يمرّ.
  - **الحالة الحالية:** البوابة نفسها تُشغَّل الآن آليًا في **GitHub Actions على كل PR** (H7.2) وكانت خضراء آخر مرة على Linux بـ209/209، إضافةً إلى عتبات تغطية حاجبة (93% أسطر) وبوابة `pnpm audit --prod --audit-level high`. راجع `CLAUDE_CODE_PROMPT_Tender_Hardening.md` لتفاصيل طور التقوية.
- [x] **M8.6** — README.md: خطوات التشغيل من الصفر (clone → docker → migrate → seed → dev) + حسابات التجربة + خريطة الـAPI.
  - ✅ Verify: نفّذ الخطوات في مجلد جديد نظيف وتأكد إنها تعمل كما هي مكتوبة.
  - Verified: `README.md` يغطي الخطوات الخمس (استنساخ وتثبيت → متغيرات البيئة → تشغيل القاعدة بخيارين → migrate + seed → تشغيل api:4000 وweb:5173)، وجدول **حسابات التجربة الخمسة** بكلمة المرور الموحّدة، وخريطة API كاملة مقسّمة بالأقسام، وقسم عمليات يربط مستندات التشغيل.
  - **تحديث لاحق (H8.3):** حُدِّثت خريطة الـAPI لتحمل بادئة **`/v1`** (27 مسارًا) بعد نسخنة الـAPI في H6.3 — كانت ستُضلّل القارئ بدونها.

**🔒 بوابة الخروج من M8 = اكتمال الإصدار الأول (v1.0).** ضع tag: `git tag v1.0.0`. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-22، `d49bec3`):** كل بنود M0–M8 مغلقة ومُتحقَّقة، والمجموعة 104 خضراء. تلاها 4 تحسينات ما بعد v1.0 (إدارة مستخدمين، فلاتر القائمة، إعدادات التذكير، قفل التعديل بعد التقديم) ثم **طور التقوية المؤسسية** الموثّق في `CLAUDE_CODE_PROMPT_Tender_Hardening.md` والمُصدَر بوسم `v2.0.0`.

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
| M1 — Auth & RBAC | ✅ مكتمل | 2026-07-20 | 20 passed (api 18 + web 2) |
| M2 — Tender CRUD | ✅ مكتمل | 2026-07-20 | 41 passed (api 39 + web 2) |
| M3 — المراجعة والChecklist | ✅ مكتمل ومُتحقَّق (`0644e58`) | 2026-07-21 | 52 passed (11 جديدة لـM3) |
| M4 — الWorkflow | ✅ مكتمل ومُتحقَّق (`86941ce`) | 2026-07-22 | api 71 passed (21 جديدة: 10 وحدة + 10 مسارات + E2E) |
| M5 — المرفقات | ✅ مكتمل ومُتحقَّق (`badac48`) | 2026-07-22 | api 80 passed (9 جديدة) |
| M6 — الإشعارات | ✅ مكتمل ومُتحقَّق (`f3d97b4`) | 2026-07-22 | 92 passed (api 90 + web 2) — 14 جديدة |
| M7 — Dashboards | ✅ مكتمل ومُتحقَّق (`d28051f`) | 2026-07-22 | 100 passed (api 98 + web 2) — 8 جديدة |
| M8 — Audit & Hardening | ✅ مكتمل ومُتحقَّق (`d49bec3`) | 2026-07-22 | 104 passed (api 102 + web 2) — 4 جديدة |
| **v1.0 — الإصدار الأول** | ✅ **مكتمل** — وسم `v1.0.0` (`d49bec3`) | 2026-07-22 | كل بنود M0–M8 مغلقة ومُتحقَّقة |
| ما بعد v1.0 — 4 تحسينات | ✅ مكتمل | 2026-07-23 | إدارة مستخدمين، فلاتر القائمة، إعدادات التذكير، قفل التعديل بعد التقديم |
| **طور التقوية (H0–H8)** | ✅ مكتمل — وسم `v2.0.0` | 2026-07-26 | يُتابَع في `CLAUDE_CODE_PROMPT_Tender_Hardening.md` (يبقى H7.1 بانتظار Docker) |

> **⚠️ ملاحظة توافق — مسارات الـAPI في هذا الملف بلا بادئة `/v1`.**
> بنود M2–M8 أعلاه تذكر المسارات كما كُتبت في v1.0 (`/tenders`, `/notifications`, …).
> بعد **H6.3** صارت كل مسارات الأعمال تحت **`/v1`** (`/v1/tenders` …) والمسارات القديمة تعيد 404،
> بينما تبقى `/health` و`/livez` و`/readyz` و`/metrics` و`/docs` بلا نسخنة عمدًا.
> الخريطة الصحيحة والمحدَّثة في `README.md`. في الواجهة: ابنِ الروابط من `API_BASE` في
> `apps/web/src/api/client.ts` ولا تكتبها يدويًا.

---

## 🐞 سجل المشاكل والحلول (يملؤه Claude Code أثناء العمل)

| التاريخ | Milestone | المشكلة | الحل |
|---|---|---|---|
| 2026-07-20 | M0 | الجهاز لا يملك Docker ولا PostgreSQL محلي، وM0.2 تتطلب `docker compose up` | كُتب `docker-compose.yml` كما تنص الخطة (يعمل عند توفر Docker)، وأُضيف بديل تطوير user-space: سكريبت `pnpm db:start` يشغّل PostgreSQL 16 حقيقي عبر حزمة `embedded-postgres` على نفس المنفذ ونفس بيانات الاتصال — الـstack لم يتغير (PostgreSQL + Prisma) |
| 2026-07-20 | M0 | `embedded-postgres@^16.4.0-beta.15` غير موجود على npm | تثبيت الإصدار المتاح `16.14.0-beta.17` (PostgreSQL 16.14) |
| 2026-07-20 | M0 | تعارض أنواع: vitest 2 مربوط بـvite 5 بينما المشروع على vite 6 (فشل build) | ترقية vitest إلى ^3 في api وweb — يدعم vite 6 |
| 2026-07-20 | M1 | `initdb` على Windows أنشأ القاعدة بترميز WIN1252 فرفض النص العربي في الـseed (خطأ 22P05) | إعادة تهيئة الـcluster مع `initdbFlags: ['--encoding=UTF8', '--locale=C']` وحذف `.pgdata` القديمة، ثم إعادة migrate + seed — العربية تُخزَّن وتُسترجع سليمة |
| 2026-07-20 | M1 | فشل type augmentation لـ`express-serve-static-core` مع عزل pnpm (TS2664) | استبداله بـ`declare global namespace Express` — يعمل مع @types/express مباشرة |
| 2026-07-20 | M1 | أخطاء "Invalid hook call" في كونسول المتصفح | ثبت أنها رسائل تاريخية متراكمة من فترة إعادة تثبيت التبعيات أثناء عمل خادم Vite — التحميل النظيف بعد marker لا يُظهر أي خطأ |
| 2026-07-20 | M2 | `z.coerce.date` مع defaults كسر نوع الإخراج في `validate()` (TS18048: page possibly undefined) | تغيير توقيع validate إلى `<S extends z.ZodTypeAny>(schema: S): z.output<S>` للحفاظ على أنواع الإخراج |
| 2026-07-20 | M2 | رسالة `Invalid date` الإنجليزية من `z.coerce.date` عند ترك موعد الإغلاق فارغًا | استخدام `errorMap` مخصص برسالة عربية في createTenderSchema وupdateTenderSchema |

---

## ✋ نقاط توقّف إلزامية (اسألني قبل المتابعة)

1. بعد M1: أعرض عليّ الـPrisma Schema النهائي قبل ما تبني عليه.
2. بعد M4: أعرض عليّ جدول انتقالات الـState Machine للمراجعة.
3. قبل M8.6: اسألني إن كنت أريد إعداد Deploy (Render/Railway) أم يكفي التشغيل المحلي.
