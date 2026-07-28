# نظام إدارة واكتشاف المناقصات الذكي — Smart Tender Management System

نظام ويب داخلي لإدارة دورة حياة المناقصات كاملة: اكتشاف ← مراجعة QA بقائمة تحقق ← إعداد العرض ← اعتماد المدير ← تقديم ← تسجيل النتيجة (فوز/خسارة)، مع مرفقات وإشعارات ولوحات معلومات وتقارير وسجل عمليات (Audit Trail).

## التقنيات (Tech Stack)

| الطبقة | التقنية |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind (RTL) + TanStack Query + Recharts |
| Backend | Node.js + Express + TypeScript |
| ORM / DB | Prisma + PostgreSQL 16 |
| Auth | JWT (httpOnly cookie) + bcrypt |
| Validation | Zod (مشترك بين Front/Back عبر `packages/shared`) |
| Testing | Vitest + Supertest (backend) · Vitest + Testing Library (frontend) |
| Security | Helmet + CORS + تحديد معدل موزّع (Redis) + قفل حسابات + إبطال جلسات (jti) |
| Observability | pino (سجلات JSON) + `x-request-id` + مقاييس Prometheus على `/metrics` |
| Storage | Amazon S3 خلف `StorageService` (أو قرص محلي للتطوير) |
| Infra | Redis (تحديد معدل/أقفال/كاش) · Docker (متعدد المراحل) · GitHub Actions |

> **الإصدار v2.0.0 — الجاهزية المؤسسية.** أُنجز طور تقوية كامل (H0–H8) يغلق 19 من 20 نتيجة تدقيق:
> صفر ثغرات حرجة/عالية في تبعيات الإنتاج، 211 اختبارًا بتغطية 93%، واجهة منسخَنة تحت `/v1` وموثّقة على `/docs`.
> التفاصيل: [تقرير التدقيق النهائي](docs/operations/hardening-audit-report.md).

**الهيكل:** Monorepo يُدار بـpnpm — `apps/api` (الخادم) · `apps/web` (الواجهة) · `packages/shared` (مخططات Zod مشتركة).

---

## المتطلبات المسبقة (Prerequisites)

- **Node.js ≥ 20** (تم التطوير على 24)
- **pnpm ≥ 9** (`npm i -g pnpm`)
- **PostgreSQL 16** — عبر أحد الخيارين:
  - **Docker** (مُوصى به): `docker compose up -d` (انظر `docker-compose.yml`)
  - **بديل بدون Docker**: `pnpm db:start` يشغّل PostgreSQL 16 مضمّنًا (embedded-postgres) على نفس المنفذ وبيانات الاتصال.

---

## التشغيل من الصفر (Setup)

```bash
# 1) الاستنساخ والتثبيت
git clone <repo-url> tender
cd tender
pnpm install

# 2) إعداد متغيرات البيئة (انسخ المثال)
cp apps/api/.env.example apps/api/.env

# 3) تشغيل قاعدة البيانات (اختر واحدًا)
docker compose up -d      # إن توفّر Docker
pnpm db:start             # أو البديل المضمّن (يعمل في نافذة منفصلة)

# 4) تهيئة المخطط وبذر البيانات
pnpm db:migrate
pnpm db:seed

# 5) التشغيل (api على :4000 و web على :5173)
pnpm dev
```

ثم افتح المتصفح على **http://localhost:5173**.

> `.env` الافتراضي يشير إلى `postgresql://postgres:postgres@localhost:5432/tender_dev` ويحوي `JWT_SECRET` تطويريًا — **غيّره في الإنتاج**.

---

## حسابات التجربة (Seed Accounts)

كلمة المرور الموحّدة للجميع: **`Test1234!`**

| البريد | الدور | الصلاحيات |
|---|---|---|
| `admin@test.com` | ADMIN | إدارة المستخدمين والأدوار |
| `qa@test.com` | QA | تسجيل مناقصة، مراجعة + Checklist، تعيين كاتب، استبعاد |
| `writer@test.com` | WRITER | إعداد العرض، رفع المرفقات، إرسال للاعتماد |
| `manager@test.com` | MANAGER | اعتماد/إعادة/إيقاف، تسجيل التقديم والنتيجة، التقارير، سجل العمليات |
| `owner@test.com` | OWNER | قراءة فقط: لوحات المعلومات والتقارير |

يُنشئ الـseed أيضًا 5 مناقصات تجريبية بحالات مختلفة + قالب Checklist افتراضي (6 بنود) + إعداد `closingReminderDays=3`.

---

## الأوامر (Scripts)

| الأمر | الوصف |
|---|---|
| `pnpm dev` | تشغيل الخادم والواجهة معًا |
| `pnpm test` | كل الاختبارات (api + web) |
| `pnpm lint` | ESLint على المستودع كامل |
| `pnpm build` | فحص الأنواع + بناء الإنتاج |
| `pnpm db:start` | تشغيل PostgreSQL المضمّن (بديل Docker) |
| `pnpm db:migrate` | تطبيق ترحيلات Prisma |
| `pnpm db:seed` | بذر المستخدمين والبيانات التجريبية |

---

## خريطة الـAPI (API Map)

كل واجهة العمل تحت البادئة **`/v1`** (H6.3). الأخطاء بشكل موحّد:
`{ "error": { "code", "message" } }`. المصادقة عبر كوكي `token` (httpOnly).

**توثيق حيّ:** `/docs` (Swagger UI) و`/openapi.json` — مُولَّدان من مخططات Zod نفسها
المستخدمة في التحقق، فلا ينحرفان عن السلوك. يُعطَّلان بـ`DOCS_ENABLED=false`.

**مسارات البنية (بلا نسخة عمدًا):** `GET /health` · `GET /livez` · `GET /readyz` · `GET /metrics`.

### المصادقة
- `POST /v1/auth/login` — دخول (يضبط الكوكي) · محدود المعدل: **5 محاولات/15د** في الإنتاج، و50 في التطوير فقط — يُضبط بـ`LOGIN_RATE_LIMIT_MAX` و`LOGIN_RATE_LIMIT_WINDOW_MS` (**لا ترفعه في الإنتاج**)
- `POST /v1/auth/logout` — خروج (يمسح الكوكي)
- `GET /v1/auth/me` — المستخدم الحالي

### المستخدمون (ADMIN)
- `GET /v1/admin/users` · `POST /v1/admin/users` · `PATCH /v1/admin/users/:id`

### المناقصات
- `GET /v1/tenders` (فلاتر + pagination) · `POST /v1/tenders` (QA)
- `GET /v1/tenders/:id` · `PATCH /v1/tenders/:id` (QA/MANAGER/ADMIN)

### المراجعة والـChecklist
- `POST /v1/tenders/:id/review/start` (QA: NEW→UNDER_REVIEW)
- `GET` / `PUT /v1/tenders/:id/checklist`
- `POST /v1/tenders/:id/review/decision` (approve/reject)
- `GET` / `POST` / `PATCH /v1/checklist-templates` (ADMIN/MANAGER)

### سير العمل (Workflow)
- `POST /v1/tenders/:id/assign` (QA → WRITER)
- `POST /v1/tenders/:id/submit-for-approval` (WRITER المعيّن)
- `POST /v1/tenders/:id/manager-decision` (approve/return/stop)
- `POST /v1/tenders/:id/mark-submitted` · `POST /v1/tenders/:id/result` (WON/LOST)

### المرفقات
- `POST /v1/tenders/:id/attachments` (WRITER, multipart) · `GET /v1/tenders/:id/attachments`
- `GET /v1/attachments/:id/download`

### الإشعارات
- `GET /v1/notifications` (+ عدّاد غير المقروء) · `POST /v1/notifications/:id/read`

### لوحات المعلومات والتقارير
- `GET /v1/dashboard` (محتوى حسب الدور)
- `GET /v1/reports/summary?from&to&userId` (MANAGER/OWNER/ADMIN)

### سجل العمليات
- `GET /v1/tenders/:id/audit` (MANAGER/OWNER/ADMIN — قراءة فقط)

---

## التوثيق التصميمي

حزمة توثيق UX/Design (قواعد العمل، الأدوار والصلاحيات، رحلات المستخدمين، جرد الشاشات) مُدارة في مستودع الوثائق `Fares-code0/tender_x` تحت `docs/design/`.

---

## التشغيل والعمليات (Operations)

| المستند | المحتوى |
| --- | --- |
| [تقرير التدقيق النهائي](docs/operations/hardening-audit-report.md) | حالة نتائج التدقيق الـ20، الدرجات قبل/بعد، نتائج الحمل والأمن |
| [إدارة الأسرار](docs/operations/secrets.md) | مصدر كل سرّ في كل بيئة، التدوير، التعامل مع تسريب |
| [الثغرات المعروفة](docs/operations/security-advisories.md) | الثغرات المفتوحة وتقييم قابلية استغلالها |

```bash
# بناء وتشغيل إنتاجي
pnpm --filter @tender/api build && pnpm --filter @tender/api start

# البوابة الكاملة
pnpm lint && pnpm test && pnpm build
pnpm --filter @tender/api test:coverage    # عتبات تغطية حاجبة
pnpm audit --prod --audit-level high       # فحص أمني لتبعيات الإنتاج
```
