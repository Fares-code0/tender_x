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
    },
  },
});
