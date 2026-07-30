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
RUN pnpm --filter @tender/api --prod deploy --legacy /app/deploy

# ⚠️ `deploy` يعيد بناء `node_modules` من مخزن pnpm، فلا ينتقل إليه عميل Prisma
# المولَّد في السطر أعلاه (يُكتب داخل مسار المخزن الافتراضي لا داخل الحزمة).
# بدون إعادة التوليد هنا تُقلع الحاوية ثم تسقط بـ
# «@prisma/client did not initialize yet». نمرّر مخططًا داخل `deploy` ليَحلّ
# مسار `@prisma/client` إلى `/app/deploy/node_modules` فيولَّد العميل بجواره.
COPY apps/api/prisma /app/deploy/prisma
RUN pnpm --filter @tender/api exec prisma generate --schema /app/deploy/prisma/schema.prisma

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
COPY --from=build --chown=nodeuser:nodejs /app/deploy/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodejs /app/apps/api/dist ./dist
# المخطط والهجرات للرجوع إليها ولتشغيل `prisma migrate deploy` عند الحاجة.
# ملاحظة: أداة prisma تطويرية فلا وجود لها في هذه الصورة — الهجرات تُطبَّق
# كخطوة نشر منفصلة (خدمة `migrate` في docker-compose) لا عند إقلاع كل نسخة.
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
