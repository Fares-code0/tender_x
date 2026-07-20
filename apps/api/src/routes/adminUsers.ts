import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createUserSchema, updateUserSchema } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError, validate } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRole('ADMIN'));

const publicUser = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

adminUsersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ select: publicUser, orderBy: { createdAt: 'asc' } });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.post('/', async (req, res, next) => {
  try {
    const input = validate(createUserSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash },
      select: publicUser,
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
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'المستخدم غير موجود');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.update({
      where: { id: target.id },
      data,
      select: publicUser,
    });
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
