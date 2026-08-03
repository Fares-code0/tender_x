import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tender_test',
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
      UPLOADS_DIR: 'uploads/test',
      // S5 — التوثيق مُطفأ افتراضيًا الآن، و`openapi.test.ts` يختبر الميزة
      // نفسها فيلزمه التفعيل الصريح — وهو ما يوثّق أنها اشتراك لا افتراض.
      DOCS_ENABLED: 'true',
    },
    // H7.4 — بوابة تغطية: العتبات أقل قليلًا من المقاس الفعلي وقت ضبطها
    // (91.9% عبارات / 84.9% فروع / 89.7% دوال) فتمنع التراجع بلا هشاشة.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // نقاط دخول ومحوّلات لا تُختبر بالوحدات (تُغطّى بالتشغيل الفعلي/الحاوية)
      exclude: ['src/index.ts', 'src/services/s3Storage.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        statements: 88,
        branches: 80,
        functions: 85,
        lines: 88,
      },
    },
  },
});
