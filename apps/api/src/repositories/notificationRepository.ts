import { prisma } from '../lib/prisma';

/** H6.1 — وصول Prisma الخاص بالإشعارات. */

const RECENT_LIMIT = 50;

export function listForUserWithUnread(userId: string) {
  return Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
}

export function findById(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export function markRead(id: string) {
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}
