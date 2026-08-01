# H7.1 — صورة إنتاج متعددة المراحل لواجهة الـAPI.
#
# تُبنى من **جذر المستودع** لأن الحزمة تعتمد على `@tender/shared` في مساحة العمل:
#   docker build -f apps/api/Dockerfile -t tender-api .
#
# ملاحظة: الاعتماديات لا تُخبز في الصورة إطلاقًا — تُمرَّر وقت التشغيل
# (متغيرات بيئة/دور IAM). راجع H7.3.

# ---------- 1) التبعيات ----------
# pnpm 11 يشترط Node >= 22.13، ومراحل البناء تشغّله عبر corepack
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# OpenSSL مطلوب **هنا أيضًا** لا في صورة التشغيل وحدها: Prisma يستنتج إصدار
# libssl وقت التثبيت والتوليد ليختار المحرّك المطابق. بدونه يحذّر
# «failed to detect the libssl/openssl version» ويرجع إلى `openssl-1.1.x`،
# فيُولَّد محرّك لا يعمل في صورة التشغيل (bookworm عليه openssl 3).
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# ملفات المانيفست أولًا: تتغيّر نادرًا فتبقى طبقة الـcache صالحة
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ---------- 2) البناء ----------
FROM deps AS build
WORKDIR /app
COPY . .
# توليد عميل Prisma ضروري قبل فحص الأنواع والحزم
RUN pnpm --filter @tender/api exec prisma generate
# ملاحظة: لا نبني `@tender/shared` لأن سكربته `tsc --noEmit` (فحص أنواع بلا مُخرَج)؛
# حزمة esbuild تُضمّن مصدره مباشرةً — راجع `scripts/build.ts`.
RUN pnpm --filter @tender/api build

# تبعيات الإنتاج فقط لصورة التشغيل.
# `--legacy` مطلوب: pnpm v10+ يرفض الـdeploy بدون `inject-workspace-packages`.
#
# المخرج **خارج `/app`** عمدًا: `COPY . .` أعلاه ينسخ المستودع كاملًا إلى
# `/app`، فأي مجلد جذري باسم `deploy/` (وقد أُضيف واحد في D1 للـCaddyfile)
# يجعل `/app/deploy` غير فارغ ⇒ `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY`.
# مسار خارج شجرة المستودع يُنهي هذا التصادم من جذره.
RUN pnpm --filter @tender/api --prod deploy --legacy /opt/tender-api

# ⚠️ `deploy` يعيد بناء `node_modules` من مخزن pnpm، فلا ينتقل إليه عميل Prisma
# المولَّد في السطر أعلاه (يُكتب داخل مسار المخزن الافتراضي لا داخل الحزمة).
# بدون إعادة التوليد هنا تُقلع الحاوية ثم تسقط بـ
# «@prisma/client did not initialize yet». نمرّر مخططًا داخل مخرج الـdeploy ليَحلّ
# مسار `@prisma/client` إلى `/opt/tender-api/node_modules` فيولَّد العميل بجواره.
COPY apps/api/prisma /opt/tender-api/prisma
# تُستدعى أداة prisma مباشرةً لا عبر `pnpm exec`: pnpm 11 يتحقق من تطابق
# node_modules قبل كل تنفيذ، فيرى `deploy` تغييرًا ويحاول `pnpm install
# --production` ثم يسقط بـERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY —
# وحتى لو نجح لأفسد node_modules الخاص بمرحلة البناء.
RUN /app/apps/api/node_modules/.bin/prisma generate --schema /opt/tender-api/prisma/schema.prisma

# ---------- 3) التشغيل ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# محرّك استعلام Prisma مرتبط ديناميكيًا بـOpenSSL، وصورة slim لا تضمنه —
# بدونه يفشل الإقلاع بـ«Unable to require libquery_engine-debian-openssl-3.0.x».
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# مستخدم غير جذر: لا يعمل التطبيق بصلاحيات root
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nodeuser

# تبعيات الإنتاج + عميل Prisma المولَّد + الحزمة المبنيّة
COPY --from=build --chown=nodeuser:nodejs /opt/tender-api/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodejs /app/apps/api/dist ./dist
# المخطط والهجرات: لازمة لتشغيل `prisma migrate deploy` من هذه الصورة نفسها.
#
# أداة `prisma` **تبعية إنتاج** لا تطوير (D2)، فيشملها `pnpm --prod deploy`
# وتصل إلى `node_modules/.bin/prisma` هنا. البديل — نشر صورة ثانية من
# مرحلة `build` — كان يعني صورتين تنزلق إحداهما عن الأخرى؛ وإبقاء الأداة
# خارج الصورة كان يعني أن خادمًا لا يملك سياق البناء لا يستطيع الهجرة أصلًا.
# الأداة والعميل من نفس الإصدار حتمًا لأنهما من قفل واحد.
#
# الهجرات تبقى **خطوة نشر منفصلة** لمرة واحدة (خدمة `migrate`) لا عند إقلاع
# كل نسخة: نسخ متوازية تتسابق على الهجرة نفسها.
COPY --from=build --chown=nodeuser:nodejs /app/apps/api/prisma ./prisma
COPY --from=build --chown=nodeuser:nodejs /app/apps/api/package.json ./package.json

# التخزين المحلي يكتب في `cwd/uploads` (راجع services/storage.ts). المجلد مملوك
# لـroot افتراضيًا فيفشل الرفع للمستخدم غير الجذر — نُنشئه بالملكية الصحيحة.
RUN mkdir -p /app/uploads && chown nodeuser:nodejs /app/uploads

USER nodeuser
EXPOSE 4000

# فحص الحياة يستخدم `/livez` (لا يلمس القاعدة) — H0.4
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# لا nodemon ولا tsx في الإنتاج — حزمة مبنيّة تُشغَّل مباشرةً.
# `SIGTERM` يصل إلى العملية 1 فيعمل الإيقاف الرشيق (H0.3).
CMD ["node", "dist/index.js"]
