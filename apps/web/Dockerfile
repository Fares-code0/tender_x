# D1 — صورة الواجهة: بناء ثابت بـVite ثم Caddy يخدمه ويبرّكس `/api`.
#
# تُبنى من **جذر المستودع** لأن الحزمة تعتمد على `@tender/shared` في مساحة العمل:
#   docker build -f apps/web/Dockerfile -t tender-web .
#
# لا متغيّر بيئة وقت البناء: `API_BASE` مسار نسبي (`/api/v1`)، فالصورة نفسها
# تصلح لكل بيئة ولا يوجد "بناء خاص بالإنتاج".

# ---------- 1) البناء ----------
FROM node:22-bookworm-slim AS build
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

COPY . .
# السكربت هو `tsc --noEmit && vite build` ⇒ فحص أنواع ثم مُخرَج ثابت في dist/
RUN pnpm --filter @tender/web build

# ---------- 2) التشغيل ----------
FROM caddy:2-alpine AS runtime

# مستخدم غير جذر (قيد عام في خطة النشر). لهذا يستمع Caddy على منافذ غير
# محجوزة (8080/8443 — راجع الخيارات العامة في Caddyfile) ويُعاد التوجيه
# إليها من 80/443 على المضيف: بديلٌ عن منح صلاحية CAP_NET_BIND_SERVICE.
RUN addgroup -S -g 1001 webgrp \
  && adduser -S -u 1001 -G webgrp webuser \
  && mkdir -p /data /config \
  && chown -R webuser:webgrp /data /config

COPY --from=build --chown=webuser:webgrp /app/apps/web/dist /srv
COPY --chown=webuser:webgrp deploy/Caddyfile /etc/caddy/Caddyfile

USER webuser
EXPOSE 8080 8443

# فحص حياة لا يعتمد على الـAPI: يثبت أن الملفات الثابتة تُخدَم.
#
# العنوان من البيئة لأن المنفذ والمخطَّط يختلفان بين البيئات: محليًا HTTPS
# على 8443، وعلى Render HTTP على المنفذ الذي تحدّده المنصّة. عنوان ثابت هنا
# يجعل الفحص يفشل دائمًا في إحدى البيئتين.
# `--no-check-certificate` لأن الشهادة المحلية موقّعة ذاتيًا، والمقصود حياة
# الخادم لا صلاحية الشهادة.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --no-check-certificate --spider "${HEALTHCHECK_URL:-https://127.0.0.1:8443/}" || exit 1
