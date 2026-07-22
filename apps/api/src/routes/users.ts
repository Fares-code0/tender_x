import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// قائمة مختصرة بالمستخدمين (id/name/role) لعناصر الفلاتر (مثل فلتر المسؤول)
// متاحة لأي مستخدم مصادَق — أسماء الزملاء ظاهرة أصلًا في صفوف المناقصات والتقارير.
usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});
