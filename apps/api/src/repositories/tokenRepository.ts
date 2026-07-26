import { prisma } from '../lib/prisma';

/**
 * H1.3 — قائمة إبطال التوكنات (`jti`).
 * تبقى في PostgreSQL لا Redis: الإبطال ضابط أمني يجب أن يصمد أمام إعادة تشغيل الكاش.
 */

export function isRevoked(jti: string) {
  return prisma.revokedToken.findUnique({ where: { jti } });
}

export function revoke(jti: string, userId: string, expiresAt: Date) {
  return prisma.revokedToken.upsert({
    where: { jti },
    create: { jti, userId, expiresAt },
    update: {},
  });
}

/** تنظيف كسول: إزالة التوكنات المنتهية حتى لا تنمو القائمة بلا حد */
export function purgeExpired() {
  return prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
