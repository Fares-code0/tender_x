import { Router } from 'express';
import type { TenderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { computeAggregateStats } from '../services/stats';
import { getReminderDays } from '../services/closingReminder';

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
        prisma.tender.count({ where: { status: 'NEW' } }),
        prisma.tender.count({ where: { status: 'UNDER_REVIEW', currentAssigneeId: me.id } }),
        prisma.tender.count({
          where: { status: { in: ACTIVE }, closingDate: { gte: new Date(), lte: soon } },
        }),
      ]);
      body.qa = { newCount, underReviewMineCount, closingSoonCount };
    }

    if (me.role === 'WRITER') {
      const myTasks = await prisma.tender.findMany({
        where: { currentAssigneeId: me.id, status: 'PROPOSAL_PREPARATION' },
        select: { id: true },
      });
      const returnedToMeCount = await prisma.tenderStatusHistory.count({
        where: {
          toStatus: 'PROPOSAL_PREPARATION',
          note: { not: null },
          tender: { currentAssigneeId: me.id, status: 'PROPOSAL_PREPARATION' },
          fromStatus: 'PENDING_APPROVAL',
        },
      });
      body.writer = { myTasksCount: myTasks.length, returnedToMeCount };
    }

    if (me.role === 'MANAGER') {
      const [pendingApprovalCount, submittedCount] = await Promise.all([
        prisma.tender.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.tender.count({ where: { status: 'SUBMITTED' } }),
      ]);
      body.manager = { pendingApprovalCount, submittedCount };
    }

    // إحصائيات شاملة للرسوم البيانية (توزيع الحالات + شهريًا) لكل الأدوار
    const stats = await computeAggregateStats();
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
