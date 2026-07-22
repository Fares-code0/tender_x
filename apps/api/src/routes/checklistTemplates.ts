import { Router } from 'express';
import { createChecklistTemplateSchema, updateChecklistTemplateSchema } from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError, validate } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

export const checklistTemplatesRouter = Router();

checklistTemplatesRouter.use(requireAuth);

const templateInclude = {
  items: { orderBy: { order: 'asc' } },
} as const;

// M3.1 — قائمة قوالب الـChecklist مع بنودها مرتبة
checklistTemplatesRouter.get('/', async (_req, res, next) => {
  try {
    const templates = await prisma.checklistTemplate.findMany({
      include: templateInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

// M3.1 — إنشاء قالب ببنوده (Admin/Manager فقط)
checklistTemplatesRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = validate(createChecklistTemplateSchema, req.body);
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.checklistTemplate.create({
        data: {
          name: input.name,
          items: { create: input.items.map((it) => ({ text: it.text, order: it.order })) },
        },
        include: templateInclude,
      });
      await logAudit({
        tx,
        userId: req.user!.id,
        action: 'CHECKLIST_TEMPLATE_CREATED',
        details: { templateId: created.id, name: created.name, itemCount: created.items.length },
      });
      return created;
    });
    res.status(201).json({ template });
  } catch (err) {
    next(err);
  }
});

// M3.1 — تعديل قالب: الاسم/التفعيل و/أو بنوده (Admin/Manager فقط)
checklistTemplatesRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = validate(updateChecklistTemplateSchema, req.body);
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'القالب غير موجود');

    const template = await prisma.$transaction(async (tx) => {
      if (input.name !== undefined || input.isActive !== undefined) {
        await tx.checklistTemplate.update({
          where: { id: existing.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
        });
      }

      if (input.items) {
        // مصالحة البنود: تحديث الموجود بالـid، إنشاء الجديد، حذف المفقود
        const keepIds = input.items.filter((it) => it.id).map((it) => it.id!);
        await tx.checklistItem.deleteMany({
          where: { templateId: existing.id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
        });
        for (const it of input.items) {
          if (it.id) {
            await tx.checklistItem.update({
              where: { id: it.id },
              data: { text: it.text, order: it.order },
            });
          } else {
            await tx.checklistItem.create({
              data: { templateId: existing.id, text: it.text, order: it.order },
            });
          }
        }
      }

      await logAudit({
        tx,
        userId: req.user!.id,
        action: 'CHECKLIST_TEMPLATE_UPDATED',
        details: { templateId: existing.id, changes: Object.keys(input) },
      });

      return tx.checklistTemplate.findUnique({
        where: { id: existing.id },
        include: templateInclude,
      });
    });

    res.json({ template });
  } catch (err) {
    next(err);
  }
});
