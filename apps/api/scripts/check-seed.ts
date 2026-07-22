import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const users = await p.user.count();
const tenders = await p.tender.count();
const statuses = await p.tender.findMany({ select: { status: true, title: true } });
console.log(`users=${users} tenders=${tenders}`);
for (const s of statuses) console.log(`${s.status}: ${s.title}`);
await p.$disconnect();
