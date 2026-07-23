# 🛡️ برومبت التقوية المؤسسية: نظام إدارة المناقصات (Enterprise Hardening Plan)

> **إلى Claude Code:** هذا الملف هو خطة الطور الثاني — **تقوية الـBackend للجاهزية المؤسسية**. المشروع اكتمل وظيفيًا (v1.0: M0–M8 + 4 تحسينات ما بعد الإصدار، 112 اختبارًا أخضر). هذه الخطة تعالج نتائج **التدقيق المعماري/الأمني** (Enterprise Audit). اقرأه بالكامل، ثم اشتغل بالترتيب والتزم بقواعد العمل حرفيًا كما في المشروع السابق.

---

## ⚙️ قواعد العمل الإلزامية (نفس انضباط المشروع)

1. **اشتغل Milestone بالترتيب.** ممنوع تبدأ H(n) قبل ما تخلّص H(n-1) 100% — إلا لو طلبتُ خلاف ذلك.
2. **كل بند له خطوة تحقق (✅ Verify).** ممنوع تعلّم `[x]` إلا بعد: كتابة الكود + تشغيله فعليًا (test/curl/فتح الصفحة) + مطابقة معيار القبول.
3. **حدّث هذا الملف** بعد كل بند: `[ ]` → `[x]` واكتب سطر `Verified: <إزاي اتأكدت>`.
4. **Commit بعد كل Milestone** برسالة واضحة: `feat(H2): distributed rate limiting complete + verified`.
5. **لو بند فشل التحقق:** متكملش. صلّح وسجّل في "سجل المشاكل".
6. **اكتب اختبارًا لكل تغيير سلوكي** (happy + فشل واحد على الأقل). لا تكسر أي اختبار من الـ112 القائمة.
7. **اسألني قبل أي قرار معماري كبير** غير مذكور هنا (إضافة Redis/Queue/تغيير بنية المصادقة… إلخ) أو قبل إضافة أي تبعية أساسية.
8. **بوابة الخروج النهائية:** `pnpm lint && pnpm test && pnpm build` أخضر بالكامل بعد كل Milestone.

---

## 📊 سياق التدقيق (الوضع الحالي — موثّق بالكود)

- **Stack موجود فعلًا:** Express 4 + TS، Prisma 6 + PostgreSQL، JWT في httpOnly cookie، bcrypt، Zod، Helmet، CORS، express-rate-limit، multer (قرص محلي)، node-cron.
- **غائب فعلًا (grep=0):** Redis، Queue/BullMQ، logging منظّم (pino/winston)، correlation IDs، `process.on/SIGTERM`، `trust proxy`، `.github/` (CI)، Dockerfile للتطبيق، metrics/tracing.
- **درجات التدقيق:** Architecture 62 · Security 56 · Performance 60 · Scalability 40 · Maintainability 66 · Tests 78 · **Production Readiness 47**.
- **الحكم:** _Requires Significant Improvements_ للنشر المؤسسي/الأفقي؛ قريب من _Production with Minor Fixes_ لنسخة واحدة داخلية خلف بروكسي موثوق بعد إنجاز H0.

### مفتاح الأولوية

🔴 **CRITICAL/HIGH** (يمنع الإنتاج) · 🟠 **MEDIUM** (يجب قبل التوسّع) · 🟡 **LOW** (تحسين)

---

# 🏁 الـMilestones

## H0 — مكاسب أمنية سريعة (حاصرة للإنتاج) 🔴

**الهدف:** إغلاق العيوب عالية الأثر منخفضة الجهد أولًا.

- [x] **H0.1** — تحقق بيئة صارم + إزالة الـJWT secret الافتراضي. (Finding #1 — `apps/api/src/lib/env.ts:17`)
  - المطلوب: وحدة تتحقق من `process.env` بـZod عند الإقلاع وترمي خطأ فادحًا إن غاب `JWT_SECRET`/`DATABASE_URL`، أو ساوى `JWT_SECRET` القيمة الافتراضية في الإنتاج. احذف السطر `?? 'dev-secret-...'`.
  - ✅ Verify: `parseEnv()` بـZod يرمي عند غياب `JWT_SECRET`/`DATABASE_URL` وعند سرّ افتراضي/قصير في الإنتاج؛ حُذف الـfallback. **Verified:** 7 اختبارات في `tests/env.test.ts` خضراء + فحص يدوي: `NODE_ENV=production` بسرّ افتراضي ⇒ فشل فوري برسالة واضحة، وبسرّ قوي ⇒ إقلاع سليم.
- [x] **H0.2** — ضبط `trust proxy`. (Finding #2 — `apps/api/src/app.ts` بلا `app.set`)
  - المطلوب: `app.set('trust proxy', <hops>)` ليصح `req.ip` (rate limit) و`secure` cookie و`X-Forwarded-Proto` خلف LB.
  - ✅ Verify: `app.set('trust proxy', env.trustProxyHops)` (افتراضي 1 عبر `TRUST_PROXY`). **Verified:** اختبار `health.test.ts` يؤكد `app.get('trust proxy') === 1` (رقم لا `true`).
- [x] **H0.3** — إيقاف رشيق (Graceful shutdown). (Finding #6 — `apps/api/src/index.ts`)
  - المطلوب: التقاط `SIGTERM`/`SIGINT` → إيقاف قبول الطلبات، `server.close()`, `prisma.$disconnect()`, إيقاف الـcron.
  - ✅ Verify: `createGracefulShutdown` (في `lib/shutdown.ts`) يوقف الـcron ثم `server.close()` ثم `prisma.$disconnect()` ثم exit، وربطه بالإشارتين في `index.ts`. **Verified:** 3 اختبارات في `tests/shutdown.test.ts` (المسار السعيد + فشل الإغلاق يخرج 1 + idempotent).
- [x] **H0.4** — فحوص جاهزية/حياة حقيقية. (Finding #7 — `apps/api/src/app.ts:31`)
  - المطلوب: `/livez` (العملية) + `/readyz` (ينفّذ `SELECT 1` عبر Prisma). إبقاء `/health` للتوافق.
  - ✅ Verify: `/livez` (200) و`/readyz` (`SELECT 1` → 200، وإلا 503) مع إبقاء `/health`. **Verified:** اختبارات `health.test.ts` (livez 200، readyz 200، readyz 503 عبر mock فشل القاعدة) + فحص يدوي بـcurl على `:4000`.
- [x] **H0.5** — إزالة/تقييد endpoint التصحيح `/ping`. (Finding #19 — `apps/api/src/app.ts:50`)
  - ✅ Verify: `/ping` مغلَّف بـ`if (env.nodeEnv !== 'production')` ⇒ غير موجود في الإنتاج، متاح في dev/test. **Verified:** اختبارا `/ping` في `health.test.ts` (بيئة non-prod) خضراوان + فحص يدوي بـcurl.

**🔒 بوابة H0:** الأسرار fail-fast، trust proxy مضبوط، shutdown رشيق، readiness يفحص القاعدة. — ✅ **مُنجَزة ومُتحقَّقة (2026-07-24):** `pnpm lint && pnpm test && pnpm build` أخضر بالكامل (124 اختبارًا، منها 17 جديدة لـH0).

---

## H1 — تقوية المصادقة والتفويض 🔴/🟠

- [ ] **H1.1** — تقييد تفويض تنزيل المرفقات (إصلاح BOLA). (Finding #3 — `apps/api/src/routes/attachments.ts` download)
  - المطلوب: التحقق من علاقة المستخدم بالمناقصة قبل البثّ (أو توثيق واعتماد سياسة "كل المستخدمين الداخليين يقرؤون كل المناقصات" صراحةً). يُفضّل روابط تنزيل موقّعة محدودة الصلاحية.
  - ✅ Verify: اختبار: مستخدم بلا صلاحية على المناقصة يُرفض تنزيله (403/404).
- [ ] **H1.2** — حماية CSRF. (Finding #18 — `apps/api/src/routes/auth.ts:28` sameSite=lax فقط)
  - المطلوب: توكن CSRF (double-submit) لطلبات التغيير، أو `sameSite=strict` للـmutations.
  - ✅ Verify: طلب POST بلا توكن CSRF يُرفض.
- [ ] **H1.3** — توكن وصول قصير + refresh + إبطال. (Finding #12 — JWT 7d بلا إبطال)
  - المطلوب: access token قصير (15د) + refresh token، أو denylist بـ`jti`. `logout` يُبطل فعليًا.
  - ✅ Verify: اختبار: توكن مُبطَل لا يُقبل بعد logout رغم عدم انتهاء صلاحيته.
- [ ] **H1.4** — سياسة كلمة مرور قوية. (Finding #17 — `packages/shared/src/schemas/auth.ts` min(8) فقط)
  - المطلوب: تعقيد + فحص تسريب (zxcvbn/HIBP)؛ رفع bcrypt cost إلى 12.
  - ✅ Verify: اختبار: كلمة مرور ضعيفة تُرفض بـ422.

**🔒 بوابة H1:** كل مسار تفويض مُقيَّد بالكائن، CSRF مفعّل، جلسات قابلة للإبطال.

---

## H2 — تحديد المعدل والحماية من الإساءة (موزّع) 🟠

- [ ] **H2.1** — Redis-backed distributed rate limiter. (Finding #4 — `apps/api/src/app.ts:36` MemoryStore) — **يتطلب موافقتك على إضافة Redis.**
  - ✅ Verify: العدّاد مشترك بين نسختين (اختبار تكامل أو فحص يدوي).
- [ ] **H2.2** — حدود عامة + لكل endpoint حسّاس + رأس `Retry-After`.
  - ✅ Verify: 429 يتضمن `Retry-After`؛ حد عام مثبت باختبار.
- [ ] **H2.3** — قفل ضد التخمين على مستوى الحساب (اختياري).
  - ✅ Verify: N محاولات فاشلة تُقفل الحساب مؤقتًا.

**🔒 بوابة H2:** تحديد المعدل يعمل عبر نسخ متعددة.

---

## H3 — المراقبة والملاحظة (Observability) 🟠

- [ ] **H3.1** — logging منظّم + request logging. (Finding #10 — `console.*` فقط في `errors.ts:40`, `index.ts`)
  - المطلوب: `pino` + `pino-http`، مستويات، بلا تسريب أسرار.
  - ✅ Verify: كل طلب يُسجَّل بسطر JSON منظّم.
- [ ] **H3.2** — Correlation/Request IDs.
  - ✅ Verify: كل طلب/سجل يحمل `x-request-id` قابلًا للتتبّع.
- [ ] **H3.3** — Metrics (`prom-client` + `/metrics`). (Finding #11)
  - ✅ Verify: `/metrics` يعرض عدّادات RED الأساسية.
- [ ] **H3.4** — Tracing (OpenTelemetry) — اختياري حسب البنية.
  - ✅ Verify: أثر موزّع يظهر لطلب كامل.

**🔒 بوابة H3:** سجلات + مقاييس + correlation IDs في كل الطلبات.

---

## H4 — الأداء والوصول للبيانات 🟠

- [ ] **H4.1** — نقل تجميع Dashboard/Reports إلى SQL. (Finding #9 — `services/stats.ts:31,53` يحمّل كل الصفوف للذاكرة)
  - المطلوب: `groupBy`/Views بدل الحساب في JS.
  - ✅ Verify: نفس الأرقام مع استعلام واحد مجمّع (اختبار مطابقة).
- [ ] **H4.2** — إصلاح N+1 في تقرير المستخدمين. (Finding #9 — `routes/reports.ts:52-56` استعلامان لكل مستخدم)
  - ✅ Verify: استعلام مجمّع واحد بدل O(2N).
- [ ] **H4.3** — تحديد/ترقيم القوائم غير المحدودة. (Finding #9 — audit `tenders.ts:683` بلا take، `users.ts` بلا حد)
  - ✅ Verify: كل قائمة لها `take`/pagination.
- [ ] **H4.4** — ضبط تجمّع اتصالات Prisma + جاهزية PgBouncer. (Finding #14 — `lib/prisma.ts` افتراضي)
  - ✅ Verify: `connection_limit` مضبوط؛ توثيق PgBouncer.
- [ ] **H4.5** — بثّ رفع الملفات بدل تحميلها بالذاكرة. (Finding #15 — `attachments.ts` memoryStorage 20MB)
  - ✅ Verify: رفع ملف كبير لا يحمّله كاملًا في الـheap.

**🔒 بوابة H4:** لا استعلامات غير محدودة، لا تجميع في الذاكرة، لا N+1.

---

## H5 — القابلية للتوسّع والبنية عديمة الحالة 🟠

- [ ] **H5.1** — محوّل تخزين كائني (S3) خلف `StorageService`. (Finding #5 — `services/storage.ts` قرص محلي)
  - ✅ Verify: رفع/تنزيل يعمل عبر نسختين (تخزين مشترك).
- [ ] **H5.2** — إخراج الـcron خارج العملية / قفل موزّع. (Finding #8 — `index.ts:13` cron داخل كل نسخة)
  - ✅ Verify: الـjob يعمل مرة واحدة مهما تعدّدت النسخ.
- [ ] **H5.3** — طبقة Cache (Redis) — اختياري.
  - ✅ Verify: قراءات ساخنة مُخدَّمة من الكاش.

**🔒 بوابة H5:** التطبيق يعمل أفقيًا بنسخ متعددة بلا حالة محلية.

---

## H6 — إعادة الهيكلة (Clean Architecture / DDD) 🟠/🟡

- [ ] **H6.1** — طبقة Repository (إخراج Prisma من الـroutes). (Finding #13)
  - ✅ Verify: لا استدعاء Prisma مباشر داخل معالجات الـroutes.
- [ ] **H6.2** — فصل Controller → Service وتفكيك `tenders.ts` (709 سطرًا).
  - ✅ Verify: كل ملف route < ~150 سطرًا ومسؤولية واحدة.
- [ ] **H6.3** — نسخنة الـAPI (`/v1`). (Finding #20)
  - ✅ Verify: كل المسارات تحت `/v1`.
- [ ] **H6.4** — توليد OpenAPI/Swagger من Zod. (Finding #20)
  - ✅ Verify: `/docs` يعرض المخطط الحيّ.
- [ ] **H6.5** — DRY: `loadTenderOr404` + شظايا `select` مشتركة.
  - ✅ Verify: إزالة تكرار فحص وجود المناقصة/رسائل 404.

**🔒 بوابة H6:** فصل مسؤوليات واضح، لا God-file، API منسخَن وموثّق.

---

## H7 — DevOps و CI/CD 🟠

- [ ] **H7.1** — Dockerfile للتطبيق (multi-stage). (Finding #16 — لا Dockerfile)
  - ✅ Verify: `docker build` ينتج صورة تعمل.
- [ ] **H7.2** — GitHub Actions CI (lint + test + build + migrate check). (Finding #16 — لا `.github/`)
  - ✅ Verify: الـpipeline أخضر على PR.
- [ ] **H7.3** — إدارة أسرار (Secret store) بدل `.env`. (Finding #1/secrets)
  - ✅ Verify: لا أسرار في الكود؛ توثيق مصدر الأسرار.
- [ ] **H7.4** — بوابة تغطية اختبارات + اختبارات حمل/أمن. (Test Quality 78)
  - ✅ Verify: عتبة تغطية في vitest؛ سكربت حمل أساسي (k6/autocannon).

**🔒 بوابة H7:** CI يمنع الدمج عند الفشل؛ صورة قابلة للنشر؛ أسرار مُدارة.

---

## H8 — التحقق النهائي وإعادة التدقيق ✅

- [ ] **H8.1** — إعادة تشغيل التدقيق الأمني/المعماري ومقارنة الدرجات.
  - ✅ Verify: Production Readiness ≥ 80.
- [ ] **H8.2** — اختبار حمل + فحص أمني (OWASP ZAP/deps audit) موثّق.
- [ ] **H8.3** — تحديث وثائق `docs/design` + README بكل التغييرات ورفعها كـPR إلى `tender_x`.
- [ ] **H8.4** — وسم إصدار: `git tag v2.0.0` (الجاهزية المؤسسية).

---

## 🚫 خارج النطاق (ما لم نتفق عليه)

- تغيير قاعدة البيانات أو ORM.
- Microservices/إعادة كتابة كاملة.
- ميزات منتج جديدة (المهمة تقوية لا توسعة).

---

## 📊 لوحة تقدّم التقوية (حدّثها بعد كل Milestone)

| Milestone                | الأولوية | الحالة     | تاريخ الإنجاز | ملاحظات                      |
| ------------------------ | -------- | ---------- | ------------- | ---------------------------- |
| H0 — مكاسب أمنية سريعة   | 🔴       | ⬜ لم يبدأ | —             | env/proxy/shutdown/readiness |
| H1 — Auth/AuthZ          | 🔴/🟠    | ⬜ لم يبدأ | —             | BOLA/CSRF/refresh/كلمة مرور  |
| H2 — Rate limiting موزّع | 🟠       | ⬜ لم يبدأ | —             | يحتاج Redis (موافقة)         |
| H3 — Observability       | 🟠       | ⬜ لم يبدأ | —             | logging/metrics/traceIDs     |
| H4 — الأداء              | 🟠       | ⬜ لم يبدأ | —             | SQL agg/N+1/pagination       |
| H5 — القابلية للتوسّع    | 🟠       | ⬜ لم يبدأ | —             | S3/cron موزّع                |
| H6 — إعادة الهيكلة       | 🟠/🟡    | ⬜ لم يبدأ | —             | repo/service/v1/OpenAPI      |
| H7 — DevOps/CI-CD        | 🟠       | ⬜ لم يبدأ | —             | Docker/Actions/أسرار         |
| H8 — التحقق النهائي      | ✅       | ⬜ لم يبدأ | —             | إعادة تدقيق + tag v2.0.0     |

---

## 🗺️ خريطة البنود ↔ نتائج التدقيق (Traceability)

| البند  | Finding | الدليل (file:line)               | الخطورة |
| ------ | ------- | -------------------------------- | ------- |
| H0.1   | #1      | `lib/env.ts:17`                  | 🔴      |
| H0.2   | #2      | `app.ts` (لا trust proxy)        | 🔴      |
| H0.3   | #6      | `index.ts` (لا SIGTERM)          | 🔴      |
| H0.4   | #7      | `app.ts:31`                      | 🟠      |
| H0.5   | #19     | `app.ts:50`                      | 🟡      |
| H1.1   | #3      | `routes/attachments.ts` download | 🔴      |
| H1.2   | #18     | `routes/auth.ts:28`              | 🟠      |
| H1.3   | #12     | `env.ts:18` + `auth.ts` logout   | 🟠      |
| H1.4   | #17     | `schemas/auth.ts` min(8)         | 🟠      |
| H2.1/2 | #4      | `app.ts:36` MemoryStore          | 🟠      |
| H3.1/2 | #10     | `errors.ts:40`, `index.ts`       | 🟠      |
| H3.3/4 | #11     | (grep=0 metrics/otel)            | 🟠      |
| H4.1   | #9      | `services/stats.ts:31,53`        | 🟠      |
| H4.2   | #9      | `routes/reports.ts:52-56`        | 🟠      |
| H4.3   | #9      | `tenders.ts:683`, `users.ts`     | 🟠      |
| H4.4   | #14     | `lib/prisma.ts`                  | 🟠      |
| H4.5   | #15     | `routes/attachments.ts`          | 🟠      |
| H5.1   | #5      | `services/storage.ts`            | 🟠      |
| H5.2   | #8      | `index.ts:13`                    | 🟠      |
| H6.x   | #13,#20 | `routes/tenders.ts` (709)        | 🟠/🟡   |
| H7.x   | #16     | لا `.github/`، لا Dockerfile     | 🟠      |

---

## 🐞 سجل مشاكل التقوية (يملؤه Claude Code أثناء العمل)

| التاريخ | Milestone | المشكلة | الحل |
| ------- | --------- | ------- | ---- |
| —       | —         | —       | —    |

---

## ✋ نقاط توقّف إلزامية (اسألني قبل المتابعة)

1. **قبل H2:** موافقة على إدخال **Redis** (rate limit موزّع/cache) — تغيير بنية.
2. **قبل H5.1:** اختيار مزوّد التخزين الكائني (S3/R2/MinIO) وبيانات الاعتماد.
3. **قبل H6.2:** مراجعة خطة تفكيك `tenders.ts` قبل إعادة الهيكلة الكبيرة.
4. **قبل H7.3:** اختيار مصدر الأسرار (Vault/Doppler/متغيرات المنصّة).
