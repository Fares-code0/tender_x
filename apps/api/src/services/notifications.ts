import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * M6.1 — خدمة الإشعارات المركزية.
 * تُنشئ صفوف Notification في القاعدة فقط (قابلة للتوسعة لاحقًا لبريد إلكتروني —
 * خارج النطاق حاليًا). تُستدعى من أحداث سير العمل.
 */
export type NotificationType =
  | 'TENDER_CREATED'
  | 'ASSIGNED'
  | 'SUBMITTED_FOR_APPROVAL'
  | 'RETURNED'
  | 'APPROVED'
  | 'RESULT'
  | 'CLOSING_SOON';

type Db = Prisma.TransactionClient | typeof prisma;

export function notify(
  params: { userId: string; type: NotificationType; tenderId?: string; message: string },
  db: Db = prisma,
) {
  return db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      tenderId: params.tenderId,
      message: params.message,
    },
  });
}

/** يُشعِر كل المستخدمين النشطين بدور معيّن (باستثناء المنفِّذ نفسه) */
export async function notifyRole(
  params: {
    role: Role;
    type: NotificationType;
    tenderId?: string;
    message: string;
    exceptUserId?: string;
  },
  db: Db = prisma,
): Promise<number> {
  const users = await db.user.findMany({
    where: {
      role: params.role,
      isActive: true,
      ...(params.exceptUserId ? { id: { not: params.exceptUserId } } : {}),
    },
    select: { id: true },
  });
  for (const u of users) {
    await notify(
      { userId: u.id, type: params.type, tenderId: params.tenderId, message: params.message },
      db,
    );
  }
  return users.length;
}
