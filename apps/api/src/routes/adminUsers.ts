import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createUserSchema, updateUserSchema } from '@tender/shared';
import { AppError, validate } from '../lib/errors';
import * as userRepo from '../repositories/userRepository';
import { referencePaginationSchema, toSkipTake } from '../lib/pagination';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRole('ADMIN'));

adminUsersRouter.get('/', async (req, res, next) => {
  try {
    // H4.3 — قائمة مرقّمة بحد أقصى، لا تحميل كل المستخدمين دفعةً واحدة
    const p = validate(referencePaginationSchema, req.query);
    const { skip, take } = toSkipTake(p);
    const [total, users] = await userRepo.listPublicWithCount(skip, take);
    res.json({ users, total, page: p.page, pageSize: p.pageSize });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post('/', async (req, res, next) => {
  try {
    const input = validate(createUserSchema, req.body);
    const exists = await userRepo.findByEmail(input.email);
    if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await userRepo.create({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash,
    });
    await logAudit({
      userId: req.user!.id,
      action: 'USER_CREATED',
      details: { newUserId: user.id, email: user.email, role: user.role },
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = validate(updateUserSchema, req.body);
    const target = await userRepo.findById(req.params.id);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'المستخدم غير موجود');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 12);
    const user = await userRepo.update(target.id, data);
    await logAudit({
      userId: req.user!.id,
      action: 'USER_UPDATED',
      details: { targetUserId: target.id, changes: Object.keys(data) },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
