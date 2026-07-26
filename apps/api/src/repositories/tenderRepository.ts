import type { Prisma, Tender } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { userBriefSelect } from './selects';

/**
 * H6.1 — كل وصول Prisma الخاص بالمناقصات يمرّ من هنا، فلا تعرف المعالجات
 * شكل الاستعلامات ولا اسم الجداول.
 */

/** عميل Prisma أو معاملة — يسمح باستخدام نفس الدوال داخل `$transaction` */
export type Db = Prisma.TransactionClient | typeof prisma;

/** تفاصيل المناقصة الكاملة (المسؤول + المنشئ + تاريخ الحالات) */
export const tenderDetailInclude = {
  currentAssignee: userBriefSelect,
  createdBy: userBriefSelect,
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: userBriefSelect },
  },
} satisfies Prisma.TenderInclude;

export const tenderListInclude = {
  currentAssignee: userBriefSelect,
} satisfies Prisma.TenderInclude;

export function findById(id: string, db: Db = prisma): Promise<Tender | null> {
  return db.tender.findUnique({ where: { id } }) as Promise<Tender | null>;
}

/**
 * H6.5 — الفحص المكرّر «اجلب المناقصة وإلا 404» كان مكتوبًا 11 مرة بنصّ
 * رسالة متطابق. هنا مرة واحدة: أي تغيير في الرسالة/الشكل يسري على الكل.
 */
export async function findByIdOrThrow(id: string, db: Db = prisma): Promise<Tender> {
  const tender = await findById(id, db);
  if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
  return tender;
}

/** المناقصة بتفاصيلها الكاملة، أو 404 */
export async function findDetailByIdOrThrow(id: string) {
  const tender = await prisma.tender.findUnique({
    where: { id },
    include: tenderDetailInclude,
  });
  if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
  return tender;
}

/** يتحقق من وجود المناقصة فقط (بلا تحميل كل الحقول) */
export async function ensureExists(id: string): Promise<{ id: string }> {
  const tender = await prisma.tender.findUnique({ where: { id }, select: { id: true } });
  if (!tender) throw new AppError(404, 'NOT_FOUND', 'المناقصة غير موجودة');
  return tender;
}

/** M2.5 — مناقصة مشابهة (نفس الرابط، أو نفس العنوان والجهة) للتحذير من التكرار */
export function findDuplicate(input: { title: string; entity: string; url?: string | null }) {
  return prisma.tender.findFirst({
    where: {
      OR: [
        ...(input.url ? [{ url: input.url }] : []),
        { AND: [{ title: input.title }, { entity: input.entity }] },
      ],
    },
    select: { id: true, title: true, entity: true, status: true },
  });
}

/** M2.2 — إنشاء مناقصة مع أول قيد في تاريخ الحالات (داخل نفس المعاملة) */
export async function createWithInitialStatus(
  tx: Prisma.TransactionClient,
  data: Prisma.TenderUncheckedCreateInput,
  changedById: string,
) {
  const created = await tx.tender.create({ data });
  await tx.tenderStatusHistory.create({
    data: { tenderId: created.id, fromStatus: null, toStatus: 'NEW', changedById },
  });
  return created;
}

/** قائمة المناقصات المرقّمة مع الإجمالي */
export function listWithCount(args: {
  where: Prisma.TenderWhereInput;
  orderBy: Prisma.TenderOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  return Promise.all([
    prisma.tender.count({ where: args.where }),
    prisma.tender.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
      include: tenderListInclude,
    }),
  ]);
}

export function create(data: Prisma.TenderCreateInput, db: Db = prisma) {
  return db.tender.create({ data, include: tenderListInclude });
}

export function update(id: string, data: Prisma.TenderUpdateInput, db: Db = prisma) {
  return db.tender.update({ where: { id }, data, include: tenderListInclude });
}

/** تحديث بلا تضمين علاقات (للتحديثات الداخلية في سير العمل) */
export function updatePlain(id: string, data: Prisma.TenderUpdateInput, db: Db = prisma) {
  return db.tender.update({ where: { id }, data });
}

/** آخر حدث في تاريخ الحالات يطابق الشرط (يُستخدم في قرار المدير) */
export function findLastStatusEvent(where: Prisma.TenderStatusHistoryWhereInput) {
  return prisma.tenderStatusHistory.findFirst({ where, orderBy: { createdAt: 'desc' } });
}

/** عدّ المناقصات المطابقة لشرط (بطاقات لوحة المعلومات) */
export function count(where: Prisma.TenderWhereInput): Promise<number> {
  return prisma.tender.count({ where });
}

export function countStatusHistory(where: Prisma.TenderStatusHistoryWhereInput): Promise<number> {
  return prisma.tenderStatusHistory.count({ where });
}

/** معرّفات المناقصات المطابقة (لعدّ مهام المستخدم) */
export function listIds(where: Prisma.TenderWhereInput) {
  return prisma.tender.findMany({ where, select: { id: true } });
}
