import { Router } from 'express';
import type { TenderStatus } from '@prisma/client';
import * as tenderRepo from '../repositories/tenderRepository';
import { requireAuth } from '../middleware/auth';
import { computeAggregateStats } from '../services/stats';
import { getReminderDays } from '../services/closingReminder';
import { cached, CACHE_KEYS } from '../lib/cache';
import { getRedisClient } from '../lib/redis';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const ACTIVE: TenderStatus[] = ['NEW', 'UNDER_REVIEW', 'PROPOSAL_PREPARATION', 'PENDING_APPROVAL'];

// M7.1 — لوحة معلومات حسب دور الطالب
dashboardRouter.get('/', async (req, res, next) => {
  try {
    const me = req.user!;
    const body: Record<string, unknown> = { role: me.role };

    if (me.role === 'QA') {
      const days = await getReminderDays();
      const soon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const [newCount, underReviewMineCount, closingSoonCount] = await Promise.all([
        tenderRepo.count({ status: 'NEW' }),
        tenderRepo.count({ status: 'UNDER_REVIEW', currentAssigneeId: me.id }),
        tenderRepo.count({
          status: { in: ACTIVE },
          closingDate: { gte: new Date(), lte: soon },
        }),
      ]);
      body.qa = { newCount, underReviewMineCount, closingSoonCount };
    }

    if (me.role === 'WRITER') {
      const myTasks = await tenderRepo.listIds({
        currentAssigneeId: me.id,
        status: 'PROPOSAL_PREPARATION',
      });
      const returnedToMeCount = await tenderRepo.countStatusHistory({
        toStatus: 'PROPOSAL_PREPARATION',
        note: { not: null },
        tender: { currentAssigneeId: me.id, status: 'PROPOSAL_PREPARATION' },
        fromStatus: 'PENDING_APPROVAL',
      });
      body.writer = { myTasksCount: myTasks.length, returnedToMeCount };
    }

    if (me.role === 'MANAGER') {
      const [pendingApprovalCount, submittedCount] = await Promise.all([
        tenderRepo.count({ status: 'PENDING_APPROVAL' }),
        tenderRepo.count({ status: 'SUBMITTED' }),
      ]);
      body.manager = { pendingApprovalCount, submittedCount };
    }

    // إحصائيات شاملة للرسوم البيانية (توزيع الحالات + شهريًا) لكل الأدوار
    // H5.3 — قراءة ساخنة مكلفة تتغيّر ببطء ⇒ تُخدَّم من كاش Redis قصير المدة
    const stats = await cached(getRedisClient(), CACHE_KEYS.aggregateStats, () =>
      computeAggregateStats(),
    );
    body.statusDistribution = stats.byStatus;
    body.monthly = stats.monthly;
    body.total = stats.total;

    // مؤشرات الأداء الشاملة (نسبة الفوز + متوسط زمن المراحل) للمدير/المالك/الأدمن فقط
    if (me.role === 'MANAGER' || me.role === 'OWNER' || me.role === 'ADMIN') {
      body.winRate = stats.winRate;
      body.avgStageDurationDays = stats.avgStageDurationDays;
    } else {
      body.winRate = null;
      body.avgStageDurationDays = null;
    }

    res.json(body);
  } catch (err) {
    next(err);
  }
});
