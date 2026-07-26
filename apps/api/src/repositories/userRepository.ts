import type { Prisma, Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publicUserSelect, userOptionSelect } from './selects';
import type { Db } from './tenderRepository';

/** H6.1 — وصول Prisma الخاص بالمستخدمين. */

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

/** خيارات المستخدمين لعناصر الفلاتر (مرقّمة — H4.3) */
export function listOptionsWithCount(skip: number, take: number) {
  return Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ select: userOptionSelect, orderBy: { name: 'asc' }, skip, take }),
  ]);
}

/** قائمة الإدارة المرقّمة */
export function listPublicWithCount(skip: number, take: number) {
  return Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ select: publicUserSelect, orderBy: { createdAt: 'asc' }, skip, take }),
  ]);
}

/** المستخدمون لتقرير الأداء */
export function listForReport(userId?: string) {
  return prisma.user.findMany({
    where: userId ? { id: userId } : {},
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** الكتّاب المتاحون للإسناد */
export function listWriters() {
  return prisma.user.findMany({
    where: { role: 'WRITER', isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export function listByRole(role: Role, db: Db = prisma) {
  return db.user.findMany({ where: { role, isActive: true }, select: { id: true } });
}

export function create(data: Prisma.UserCreateInput, db: Db = prisma) {
  return db.user.create({ data, select: publicUserSelect });
}

export function update(id: string, data: Prisma.UserUpdateInput, db: Db = prisma) {
  return db.user.update({ where: { id }, data, select: publicUserSelect });
}

/** H2.3 — تحديث حالة قفل الحساب بعد محاولة دخول */
export function updateLoginState(
  id: string,
  data: { failedLoginAttempts: number; lockedUntil: Date | null },
) {
  return prisma.user.update({ where: { id }, data });
}
