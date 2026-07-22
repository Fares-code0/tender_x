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
| Security | Helmet + CORS + rate-limit على تسجيل الدخول |

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

كل المسارات تُعيد الأخطاء بشكل موحّد: `{ "error": { "code", "message" } }`. المصادقة عبر كوكي `token` (httpOnly).

### المصادقة
- `POST /auth/login` — دخول (يضبط الكوكي) · محدود المعدل (5/15د)
- `POST /auth/logout` — خروج (يمسح الكوكي)
- `GET /auth/me` — المستخدم الحالي

### المستخدمون (ADMIN)
- `GET /admin/users` · `POST /admin/users` · `PATCH /admin/users/:id`

### المناقصات
- `GET /tenders` (فلاتر + pagination) · `POST /tenders` (QA)
- `GET /tenders/:id` · `PATCH /tenders/:id` (QA/MANAGER/ADMIN)

### المراجعة والـChecklist
- `POST /tenders/:id/review/start` (QA: NEW→UNDER_REVIEW)
- `GET` / `PUT /tenders/:id/checklist`
- `POST /tenders/:id/review/decision` (approve/reject)
- `GET` / `POST` / `PATCH /checklist-templates` (ADMIN/MANAGER)

### سير العمل (Workflow)
- `POST /tenders/:id/assign` (QA → WRITER)
- `POST /tenders/:id/submit-for-approval` (WRITER المعيّن)
- `POST /tenders/:id/manager-decision` (approve/return/stop)
- `POST /tenders/:id/mark-submitted` · `POST /tenders/:id/result` (WON/LOST)

### المرفقات
- `POST /tenders/:id/attachments` (WRITER, multipart) · `GET /tenders/:id/attachments`
- `GET /attachments/:id/download`

### الإشعارات
- `GET /notifications` (+ عدّاد غير المقروء) · `POST /notifications/:id/read`

### لوحات المعلومات والتقارير
- `GET /dashboard` (محتوى حسب الدور)
- `GET /reports/summary?from&to&userId` (MANAGER/OWNER/ADMIN)

### سجل العمليات
- `GET /tenders/:id/audit` (MANAGER/OWNER/ADMIN — قراءة فقط)

---

## التوثيق التصميمي

حزمة توثيق UX/Design (قواعد العمل، الأدوار والصلاحيات، رحلات المستخدمين، جرد الشاشات) مُدارة في مستودع الوثائق `Fares-code0/tender_x` تحت `docs/design/`.
