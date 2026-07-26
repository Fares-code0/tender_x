import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/tender_test';

export default async function globalSetup() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname='tender_test'");
  if (exists.rowCount === 0) {
    await client.query("CREATE DATABASE tender_test ENCODING 'UTF8' TEMPLATE template0");
  }
  await client.end();

  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execSync('npx prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
