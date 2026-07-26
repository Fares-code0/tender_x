import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../lib/errors';
import { referencePaginationSchema, toSkipTake } from '../lib/pagination';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// قائمة مختصرة بالمستخدمين (id/name/role) لعناصر الفلاتر (مثل فلتر المسؤول)
// متاحة لأي مستخدم مصادَق — أسماء الزملاء ظاهرة أصلًا في صفوف المناقصات والتقارير.
usersRouter.get('/', async (req, res, next) => {
  try {
    // H4.3 — لا قائمة بلا حد؛ الافتراضي يكفي فلاتر الواجهة والحد الأقصى 100
    const p = validate(referencePaginationSchema, req.query);
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
        ...toSkipTake(p),
      }),
    ]);
    res.json({ users, total, page: p.page, pageSize: p.pageSize });
  } catch (err) {
    next(err);
  }
});
