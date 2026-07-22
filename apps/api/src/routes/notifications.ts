import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// M6.3 — إشعارات المستخدم الحالي + عدّاد غير المقروء
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

// M6.3 — تعليم إشعار كمقروء (إشعارات المستخدم نفسه فقط)
notificationsRouter.post('/:id/read', async (req, res, next) => {
  try {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.id) {
      throw new AppError(404, 'NOT_FOUND', 'الإشعار غير موجود');
    }
    const notification = await prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true },
    });
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});
