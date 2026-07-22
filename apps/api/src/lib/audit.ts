import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** BR-008: كل إجراء جوهري يُسجَّل في Audit Log */
export function logAudit(params: {
  userId: string;
  action: string;
  tenderId?: string;
  details?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? prisma;
  return client.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      tenderId: params.tenderId,
      details: params.details,
    },
  });
}
