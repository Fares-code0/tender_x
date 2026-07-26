import { prisma } from '../lib/prisma';
import { userBriefSelect } from './selects';

/** H6.1 — قراءة سجل التدقيق (الكتابة تمرّ من `lib/audit.ts`). */

/** H4.3 — مرقّم: السجل ينمو بلا حد */
export function listForTenderWithCount(tenderId: string, skip: number, take: number) {
  return Promise.all([
    prisma.auditLog.count({ where: { tenderId } }),
    prisma.auditLog.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: userBriefSelect },
    }),
  ]);
}
