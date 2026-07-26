import { Router } from 'express';
import * as userRepo from '../repositories/userRepository';
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
    const { skip, take } = toSkipTake(p);
    const [total, users] = await userRepo.listOptionsWithCount(skip, take);
    res.json({ users, total, page: p.page, pageSize: p.pageSize });
  } catch (err) {
    next(err);
  }
});
