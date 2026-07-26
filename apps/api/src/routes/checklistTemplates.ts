import { Router } from 'express';
import { createChecklistTemplateSchema, updateChecklistTemplateSchema } from '@tender/shared';
import { AppError, validate } from '../lib/errors';
import * as checklistRepo from '../repositories/checklistRepository';
import { runInTransaction, checklistItems } from '../repositories/transaction';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

export const checklistTemplatesRouter = Router();

checklistTemplatesRouter.use(requireAuth);

// M3.1 — قائمة قوالب الـChecklist مع بنودها مرتبة
checklistTemplatesRouter.get('/', async (_req, res, next) => {
  try {
    const templates = await checklistRepo.listTemplates();
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

// M3.1 — إنشاء قالب ببنوده (Admin/Manager فقط)
checklistTemplatesRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = validate(createChecklistTemplateSchema, req.body);
    const template = await runInTransaction(async (tx) => {
      const created = await checklistRepo.createTemplate(
        {
          name: input.name,
          items: { create: input.items.map((it) => ({ text: it.text, order: it.order })) },
        },
        tx,
      );
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
    const existing = await checklistRepo.findTemplateWithItems(req.params.id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'القالب غير موجود');

    const template = await runInTransaction(async (tx) => {
      if (input.name !== undefined || input.isActive !== undefined) {
        await checklistRepo.updateTemplate(
          existing.id,
          {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
          tx,
        );
      }

      if (input.items) {
        // مصالحة البنود: تحديث الموجود بالـid، إنشاء الجديد، حذف المفقود
        const keepIds = input.items.filter((it) => it.id).map((it) => it.id!);
        await checklistItems.deleteMissing(tx, existing.id, keepIds);
        for (const it of input.items) {
          if (it.id) {
            await checklistItems.update(tx, it.id, { text: it.text, order: it.order });
          } else {
            await checklistItems.create(tx, existing.id, { text: it.text, order: it.order });
          }
        }
      }

      await logAudit({
        tx,
        userId: req.user!.id,
        action: 'CHECKLIST_TEMPLATE_UPDATED',
        details: { templateId: existing.id, changes: Object.keys(input) },
      });

      return checklistRepo.findTemplateById(existing.id, tx);
    });

    res.json({ template });
  } catch (err) {
    next(err);
  }
});
