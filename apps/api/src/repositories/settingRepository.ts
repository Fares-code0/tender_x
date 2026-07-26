import { prisma } from '../lib/prisma';

/** H6.1 — وصول Prisma الخاص بإعدادات النظام. */

export function findByKey(key: string) {
  return prisma.systemSetting.findUnique({ where: { key } });
}

export function upsert(key: string, value: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
