import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// تحميل .env من جذر apps/api (Node 20+ يوفر loadEnvFile بدون مكتبات)
// في الاختبارات (VITEST) لا نحمّل .env حتى لا نكتب فوق DATABASE_URL الخاص بقاعدة الاختبار
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (!process.env.VITEST && fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // المتغيرات معرفة مسبقًا (مثلًا في الاختبارات) — نتجاهل
  }
}

export const env = {
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
};
