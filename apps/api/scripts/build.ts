/**
 * H7.0 — بناء إنتاجي حقيقي.
 *
 * كان `build` مجرد `tsc --noEmit` (فحص أنواع بلا مُخرَج)، فلم يكن هناك ما يُشغَّل
 * في حاوية: التشغيل الوحيد الممكن كان عبر `tsx` على المصدر.
 *
 * هنا نجمع الكود بـesbuild إلى ملف واحد:
 *  - حزم node_modules تبقى **خارجية** (Prisma تحتاج محرّكها، وbcrypt ثنائي أصلي)
 *  - حزم مساحة العمل (`@tender/shared`) تُجمَّع **داخل** الحزمة لأنها TypeScript خام
 *    باستيرادات بلا امتدادات لا يستطيع Node حلّها وقت التشغيل.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(await readFile(path.join(apiDir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};

// كل تبعية حقيقية تبقى خارجية؛ تبعيات مساحة العمل (workspace:*) تُجمَّع
const external = Object.entries(pkg.dependencies ?? {})
  .filter(([, version]) => !version.startsWith('workspace:'))
  .map(([name]) => name);

const result = await build({
  entryPoints: [path.join(apiDir, 'src/index.ts')],
  outfile: path.join(apiDir, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  minify: false, // نُبقيه مقروءًا: آثار الأخطاء في الإنتاج أهم من بضعة كيلوبايتات
  external,
  logLevel: 'info',
  banner: {
    // بعض الحزم (مثل swagger-ui-express) تفترض وجود require في نطاق CJS
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});

if (result.errors.length > 0) process.exit(1);
console.log(`Bundled API -> dist/index.js (external: ${external.length} packages)`);
