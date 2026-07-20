/**
 * بديل تطوير لتشغيل PostgreSQL 16 بدون Docker (الجهاز الحالي لا يملك Docker).
 * يشغّل binaries حقيقية لـPostgreSQL عبر embedded-postgres على نفس المنفذ
 * والبيانات المعرفة في docker-compose.yml، بحيث يعمل DATABASE_URL نفسه في الحالتين.
 * عند توفر Docker لاحقًا: docker compose up -d يغني عن هذا السكريبت.
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../../../.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true,
});

async function main() {
  const fs = await import('node:fs');
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Initializing PostgreSQL data directory...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('tender_dev');
    console.log('Database tender_dev created.');
  } catch {
    console.log('Database tender_dev already exists.');
  }
  console.log('PostgreSQL 16 running on port 5432 (Ctrl+C to stop).');

  const stop = async () => {
    console.log('Stopping PostgreSQL...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
