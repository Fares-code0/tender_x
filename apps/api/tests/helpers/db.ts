import bcrypt from 'bcrypt';
import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

export const TEST_PASSWORD = 'Passw0rd123';

/** تفريغ كل الجداول بين الاختبارات (يبقي جداول الـmigrations) */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TenderChecklistAnswer", "ChecklistItem", "ChecklistTemplate",
      "Attachment", "Notification", "AuditLog", "TenderStatusHistory",
      "Tender", "User", "SystemSetting"
    CASCADE
  `);
}

let emailCounter = 0;

export async function createUser(role: Role, overrides: { isActive?: boolean; email?: string } = {}) {
  emailCounter += 1;
  const email = overrides.email ?? `${role.toLowerCase()}${emailCounter}@test.com`;
  return prisma.user.create({
    data: {
      name: `مستخدم ${role}`,
      email,
      role,
      isActive: overrides.isActive ?? true,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
}

/** يسجل الدخول ويرجع كوكي الجلسة لتمريرها في الطلبات التالية */
export async function loginAs(app: Express, email: string, password: string = TEST_PASSWORD) {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
}
