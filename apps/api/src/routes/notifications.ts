import { Router } from 'express';
import { AppError } from '../lib/errors';
import * as notificationRepo from '../repositories/notificationRepository';
import { requireAuth } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// M6.3 — إشعارات المستخدم الحالي + عدّاد غير المقروء
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await notificationRepo.listForUserWithUnread(req.user!.id);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

// M6.3 — تعليم إشعار كمقروء (إشعارات المستخدم نفسه فقط)
notificationsRouter.post('/:id/read', async (req, res, next) => {
  try {
    const existing = await notificationRepo.findById(req.params.id);
    if (!existing || existing.userId !== req.user!.id) {
      throw new AppError(404, 'NOT_FOUND', 'الإشعار غير موجود');
    }
    const notification = await notificationRepo.markRead(existing.id);
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});
