/**
 * H7.4 — اختبار حمل أساسي بـautocannon.
 *
 * الهدف قياس خطّ أساس لمسارات القراءة الساخنة والتأكد من غياب أخطاء تحت الضغط،
 * لا محاكاة إنتاج كامل. يُشغَّل على خادم يعمل:
 *
 *   pnpm --filter @tender/api build && pnpm --filter @tender/api start
 *   pnpm --filter @tender/api load-test
 *
 * ملاحظة: تحديد المعدل (H2.2) مفعّل خارج بيئة الاختبار، فالحد العام سيُرجع 429
 * سريعًا. لقياس الأداء الحقيقي ارفع `RATE_LIMIT_MAX` أو شغّل الخادم بـ`NODE_ENV=test`.
 */
import autocannon from 'autocannon';

const url = process.env.LOAD_TEST_URL ?? 'http://127.0.0.1:4000';
const duration = Number(process.env.LOAD_TEST_DURATION ?? 10);
const connections = Number(process.env.LOAD_TEST_CONNECTIONS ?? 10);

/** مسارات لا تحتاج مصادقة — تقيس تكلفة الطبقة الأساسية والقاعدة */
const targets = [
  { name: 'liveness (process only)', path: '/livez' },
  { name: 'readiness (hits the database)', path: '/readyz' },
];

async function run(name: string, path: string) {
  const result = await autocannon({
    url: `${url}${path}`,
    connections,
    duration,
  });

  const non2xx = result.non2xx ?? 0;
  console.log(`\n=== ${name} — ${path} ===`);
  console.log(`  requests/sec : ${result.requests.average.toFixed(1)}`);
  console.log(`  latency avg  : ${result.latency.average.toFixed(2)} ms`);
  console.log(`  latency p99  : ${result.latency.p99.toFixed(2)} ms`);
  console.log(`  non-2xx      : ${non2xx}`);
  console.log(`  errors       : ${result.errors}`);
  return { name, non2xx, errors: result.errors, rps: result.requests.average };
}

const results = [];
for (const t of targets) results.push(await run(t.name, t.path));

// خطّ أساس بسيط: أي خطأ اتصال يعني فشلًا حقيقيًا يستحق التوقف
const failed = results.filter((r) => r.errors > 0);
if (failed.length > 0) {
  console.error(`\nLoad test FAILED: connection errors on ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
console.log('\nLoad test finished with no connection errors.');
