import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const tender = await p.tender.findFirst({
  where: { title: { contains: 'نسخة معدلة' } },
});
if (!tender) throw new Error('tender not found');
const audits = await p.auditLog.findMany({
  where: { tenderId: tender.id },
  orderBy: { createdAt: 'asc' },
  include: { user: { select: { email: true } } },
});
for (const a of audits) console.log(`${a.action} by ${a.user.email} at ${a.createdAt.toISOString()}`);
await p.$disconnect();
