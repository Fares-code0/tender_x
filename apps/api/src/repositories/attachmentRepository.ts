import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { uploaderSelect } from './selects';
import type { Db } from './tenderRepository';

/** H6.1 — وصول Prisma الخاص بالمرفقات. */

/** المرفق مع علاقة المناقصة اللازمة لفحص التفويض (H1.1) */
export function findByIdWithTender(id: string) {
  return prisma.attachment.findUnique({
    where: { id },
    include: { tender: { select: { createdById: true, currentAssigneeId: true } } },
  });
}

/** M5.3 — عدد النسخ السابقة بنفس الاسم (لحساب رقم الإصدار) */
export function countVersions(tenderId: string, fileName: string) {
  return prisma.attachment.count({ where: { tenderId, fileName } });
}

export function listForTender(tenderId: string) {
  return prisma.attachment.findMany({
    where: { tenderId },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: uploaderSelect },
  });
}

export function create(data: Prisma.AttachmentUncheckedCreateInput, db: Db = prisma) {
  return db.attachment.create({ data, include: { uploadedBy: uploaderSelect } });
}
