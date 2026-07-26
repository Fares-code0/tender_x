import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

async function readAll(dir: string): Promise<{ file: string; content: string }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: { file: string; content: string }[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await readAll(full)));
    else if (entry.name.endsWith('.ts'))
      out.push({ file: full, content: await fs.readFile(full, 'utf8') });
  }
  return out;
}

/**
 * H6.1 — حارس معماري: يمنع عودة استدعاءات Prisma إلى طبقة المسارات.
 * اختبار البنية أرخص من مراجعة يدوية، ويفشل فورًا عند أول انزلاق.
 */
describe('Architecture: routes must not touch Prisma directly (H6.1)', () => {
  it('no route file imports or calls prisma', async () => {
    const files = await readAll(path.join(srcDir, 'routes'));
    expect(files.length).toBeGreaterThan(0); // حارس ضد نجاح فارغ

    const offenders = files
      .filter((f) => /\bprisma\./.test(f.content) || /from '.*lib\/prisma'/.test(f.content))
      .map((f) => path.relative(srcDir, f.file));

    expect(offenders).toEqual([]);
  });

  it('data access lives in the repositories layer', async () => {
    const repos = await readAll(path.join(srcDir, 'repositories'));
    expect(repos.length).toBeGreaterThan(0);
    // على الأقل مستودع واحد يصل فعلًا إلى Prisma (وإلا فالطبقة صورية)
    expect(repos.some((r) => /\bprisma\./.test(r.content))).toBe(true);
  });
});
