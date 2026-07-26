import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<{ table_name: string }[]>(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
console.log(rows.map((r) => r.table_name).join(', '));
await p.$disconnect();
