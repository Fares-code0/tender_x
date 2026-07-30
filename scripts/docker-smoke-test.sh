#!/usr/bin/env bash
# H7.1 — اختبار دخان لصورة الـAPI بعد `docker compose up --build -d`.
#
# «الصورة بُنيت» ليست دليلًا على شيء: الفشل المعتاد يقع بعد الإقلاع
# (عميل Prisma غير مولَّد، محرّك بلا OpenSSL، مجلد رفع بلا صلاحية كتابة).
# لذلك تُنفَّذ الفحوص **داخل الحاوية** — لا من المضيف وحده.
#
#   JWT_SECRET=... docker compose up --build -d
#   bash scripts/docker-smoke-test.sh
set -uo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
API=${API_SERVICE:-api}
HOST_URL=${HOST_URL:-http://localhost:4000}

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n'   "$1"; printf '      %s\n' "${2:-}"; FAIL=$((FAIL + 1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# تنفيذ أمر داخل حاوية الـAPI (بلا TTY حتى يعمل في CI)
in_api() { docker compose exec -T "$API" "$@" 2>&1; }

# طلب HTTP من **داخل** الحاوية: node موجود في الصورة، curl ليس كذلك.
# يطبع "<الحالة> <المتن>" في سطر واحد.
fetch_in_api() {
  in_api node -e "
    fetch('http://127.0.0.1:4000$1')
      .then(async (r) => { console.log(r.status, (await r.text()).slice(0, 200)); })
      .catch((e) => { console.log('000', e.message); process.exit(1); });
  "
}

expect_endpoint() {
  local path=$1 want_status=$2 want_body=$3
  local out status
  out=$(fetch_in_api "$path")
  status=${out%% *}
  if [ "$status" != "$want_status" ]; then
    bad "$path ⇒ $want_status" "المُستلَم: $out"
  elif [ -n "$want_body" ] && [[ "$out" != *"$want_body"* ]]; then
    bad "$path يحتوي $want_body" "المُستلَم: $out"
  else
    ok "$path ⇒ $status ${want_body:+· $want_body}"
  fi
}

head_ "0) حالة الحاويات"
if ! docker compose ps --status running --services | grep -qx "$API"; then
  printf '\033[31mحاوية %s لا تعمل. آخر السجلات:\033[0m\n' "$API"
  docker compose logs --tail 50 "$API"
  exit 1
fi
ok "الخدمة $API تعمل"

# الهجرات خدمة لمرة واحدة: نجاحها شرط لجاهزية القاعدة
migrate_exit=$(docker compose ps -a --format '{{.Service}} {{.ExitCode}}' | awk '$1=="migrate"{print $2}')
if [ "${migrate_exit:-1}" = "0" ]; then
  ok "خدمة migrate انتهت بنجاح (الهجرات مطبَّقة)"
else
  bad "خدمة migrate انتهت بنجاح" "رمز الخروج: ${migrate_exit:-غير موجودة}"
fi

head_ "1) الانتظار حتى تصبح الحاوية سليمة (HEALTHCHECK)"
deadline=$((SECONDS + 90))
health=""
while [ $SECONDS -lt $deadline ]; do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$(docker compose ps -q "$API")" 2>/dev/null || echo unknown)
  [ "$health" = "healthy" ] && break
  if [ "$health" = "unhealthy" ]; then break; fi
  sleep 3
done
if [ "$health" = "healthy" ]; then
  ok "HEALTHCHECK ⇒ healthy"
else
  bad "HEALTHCHECK ⇒ healthy" "الحالة بعد الانتظار: $health"
fi

head_ "2) فحوص الصحة من داخل الحاوية"
expect_endpoint /livez  200 '"status":"live"'
expect_endpoint /readyz 200 '"status":"ready"'   # يُنفّذ SELECT 1 ⇒ يثبت الوصول للقاعدة
expect_endpoint /health 200 '"status":"ok"'

head_ "3) التطبيق يخدم مساراته فعلًا (لا مجرد فحوص صحة)"
# مسار محمي بلا كوكي ⇒ 401 يثبت أن التوجيه والمصادقة يعملان،
# بينما 500 يكشف عميل Prisma غير مولَّد أو محرّكًا مفقودًا.
expect_endpoint /v1/tenders 401 ''
# مسار غير موجود ⇒ 404 من التطبيق لا من بروكسي
expect_endpoint /v1/does-not-exist 404 ''

head_ "4) صلابة الصورة"
uid=$(in_api id -u | tr -d '\r')
if [ "$uid" = "1001" ]; then
  ok "التطبيق يعمل بمستخدم غير جذر (uid=$uid)"
else
  bad "التطبيق يعمل بمستخدم غير جذر" "uid المُستلَم: $uid"
fi

pid1=$(in_api cat /proc/1/cmdline | tr '\0' ' ' | tr -d '\r')
if [[ "$pid1" == *"node dist/index.js"* ]]; then
  ok "العملية 1 هي حزمة الإنتاج (SIGTERM يصلها ⇒ إيقاف رشيق)"
else
  bad "العملية 1 = node dist/index.js" "المُستلَم: $pid1"
fi

# نُنشئ العميل فعلًا بدل فحص مسار داخلي: هذا هو العطل المقصود حرفيًا
# («did not initialize yet» عند ضياع المولَّد في `pnpm deploy`)، ولا يتعلّق
# بأسماء ملفات Prisma الداخلية التي تتغيّر بين الإصدارات.
if in_api node --input-type=commonjs -e \
  "const { PrismaClient } = require('@prisma/client'); new PrismaClient();" >/dev/null 2>&1; then
  ok "عميل Prisma مولَّد ويُنشَأ داخل الصورة"
else
  bad "عميل Prisma مولَّد ويُنشَأ داخل الصورة" \
    "$(in_api node --input-type=commonjs -e "const { PrismaClient } = require('@prisma/client'); new PrismaClient();" | head -3)"
fi

if in_api sh -c 'touch /app/uploads/.smoke && rm /app/uploads/.smoke' >/dev/null 2>&1; then
  ok "مجلد المرفقات قابل للكتابة للمستخدم غير الجذر"
else
  bad "مجلد /app/uploads قابل للكتابة" "الرفع سيفشل وقت التشغيل"
fi

if in_api sh -c 'test ! -e /app/node_modules/tsx && test ! -e /app/.env' >/dev/null 2>&1; then
  ok "لا tsx ولا ملف .env داخل الصورة"
else
  bad "الصورة نظيفة من أدوات التطوير والأسرار" "وُجد tsx أو .env في /app"
fi

head_ "5) وصول المضيف عبر المنفذ المنشور"
host_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HOST_URL/livez" || echo 000)
if [ "$host_status" = "200" ]; then
  ok "$HOST_URL/livez ⇒ 200"
else
  bad "$HOST_URL/livez ⇒ 200" "المُستلَم: $host_status"
fi

head_ "6) السجلات"
logs=$(docker compose logs --no-color "$API" 2>&1)
if grep -q '"msg":"API listening"' <<<"$logs"; then
  ok "سجل الإقلاع «API listening» موجود"
else
  bad "سجل الإقلاع «API listening»" "لم يظهر في سجلات الحاوية"
fi

# pino يكتب JSON سطرًا سطرًا — شرطٌ لأي تجميع سجلات مركزي (H3.1)
first_json=$(grep -m1 '^{' <<<"$(docker compose logs --no-color --no-log-prefix "$API" 2>&1)")
if [ -n "$first_json" ] && node -e "JSON.parse(process.argv[1])" "$first_json" >/dev/null 2>&1; then
  ok "السجلات JSON منظَّم (pino)"
else
  bad "السجلات JSON منظَّم" "أول سطر: ${first_json:-<لا شيء>}"
fi

if grep -qi 'error\|FATAL\|unhandled' <<<"$logs"; then
  bad "لا أخطاء في سجلات الإقلاع" "$(grep -i 'error\|FATAL\|unhandled' <<<"$logs" | head -3)"
else
  ok "لا أخطاء في سجلات الإقلاع"
fi

# السرّ يُمرَّر وقت التشغيل — يجب ألا يظهر في السجلات إطلاقًا (H7.3)
if [ -n "${JWT_SECRET:-}" ] && grep -qF "$JWT_SECRET" <<<"$logs"; then
  bad "السرّ غير مسرَّب في السجلات" "JWT_SECRET ظهر في مخرجات الحاوية"
else
  ok "السرّ غير مسرَّب في السجلات"
fi

head_ "النتيجة"
printf 'ناجح: %d · فاشل: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\n\033[31mاختبار الدخان فشل — H7.1 لا يُغلق.\033[0m آخر السجلات:\n'
  docker compose logs --tail 40 "$API"
  exit 1
fi
printf '\033[32mاختبار الدخان نجح.\033[0m\n'
