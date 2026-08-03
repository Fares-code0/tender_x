import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Router } from 'express';
import { mimeTypeForFile } from '@tender/shared';
import { AppError, validate } from '../../lib/errors';
import * as tenderRepo from '../../repositories/tenderRepository';
import * as attachmentRepo from '../../repositories/attachmentRepository';
import * as auditRepo from '../../repositories/auditRepository';
import { runInTransaction } from '../../repositories/transaction';
import { paginationSchema, toSkipTake } from '../../lib/pagination';
import { logAudit } from '../../lib/audit';
import { storage } from '../../services/storage';
import { upload, mapUploadError } from '../attachments';
import { requireRole } from '../../middleware/auth';

/** H6.2 — مرفقات المناقصة وسجل تدقيقها. */
export const tenderAttachmentsRouter = Router();

// M5.1 + M5.3 — رفع مرفق (WRITER) خلف StorageService + قيود النوع/الحجم + versioning
tenderAttachmentsRouter.post('/:id/attachments', requireRole('WRITER'), (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) throw mapUploadError(err);
      if (!req.file) throw new AppError(422, 'NO_FILE', 'لم يُرفَق أي ملف');

      const tender = await tenderRepo.findByIdOrThrow(req.params.id);

      // multer يفك ترميز اسم الملف كـlatin1؛ نعيد تفسيره UTF-8 لدعم الأسماء العربية
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      // M5.3 — إعادة رفع نفس الاسم تنشئ نسخة جديدة مع بقاء القديمة
      const prior = await attachmentRepo.countVersions(tender.id, fileName);
      const version = prior + 1;
      const key = `${tender.id}/${crypto.randomUUID()}${path.extname(fileName)}`;
      // H4.5 — الملف وصل متدفّقًا إلى مسار مؤقّت؛ ننقله بلا تحميله في الذاكرة
      await storage.saveFromFile(key, req.file.path);

      const attachment = await runInTransaction(async (tx) => {
        const created = await attachmentRepo.create(
          {
            tenderId: tender.id,
            fileName,
            storagePath: key,
            // S6 — من الامتداد المُتحقَّق منه لا من ترويسة العميل
            mimeType: mimeTypeForFile(fileName),
            size: req.file!.size,
            version,
            uploadedById: req.user!.id,
          },
          tx,
        );
        await logAudit({
          tx,
          userId: req.user!.id,
          tenderId: tender.id,
          action: 'ATTACHMENT_UPLOADED',
          details: { attachmentId: created.id, fileName, version, size: created.size },
        });
        return created;
      });

      res.status(201).json({ attachment });
    } catch (e) {
      // H4.5 — لا نترك ملفًا مؤقّتًا معلّقًا عند فشل التحقق/الحفظ
      if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
      next(e);
    }
  });
});

// M5.2 — قائمة مرفقات المناقصة (الاسم، الرافع، التاريخ، الحجم، الإصدار)
tenderAttachmentsRouter.get('/:id/attachments', async (req, res, next) => {
  try {
    const tender = await tenderRepo.findByIdOrThrow(req.params.id);
    const attachments = await attachmentRepo.listForTender(tender.id);
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
});

// M8.1 — سجل عمليات المناقصة (Manager/Owner/Admin) — قراءة فقط، لا حذف/تعديل (NFR-005)
tenderAttachmentsRouter.get(
  '/:id/audit',
  requireRole('MANAGER', 'OWNER', 'ADMIN'),
  async (req, res, next) => {
    try {
      const tender = await tenderRepo.ensureExists(req.params.id);
      // H4.3 — سجل التدقيق ينمو بلا حد: يُرقَّم ولا يُحمَّل كاملًا
      const p = validate(paginationSchema, req.query);
      const { skip, take } = toSkipTake(p);
      const [total, entries] = await auditRepo.listForTenderWithCount(tender.id, skip, take);
      res.json({ entries, total, page: p.page, pageSize: p.pageSize });
    } catch (err) {
      next(err);
    }
  },
);
