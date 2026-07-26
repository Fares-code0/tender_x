import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fsSync from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import multer from 'multer';
import type { Role } from '@prisma/client';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  isAllowedAttachment,
  fileExtension,
} from '@tender/shared';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { storage } from '../services/storage';
import { requireAuth } from '../middleware/auth';

/**
 * إعداد multer: حد الحجم + فلتر الأنواع المسموحة (M5.1).
 * H4.5 — تخزين على القرص (تدفّق) بدل الذاكرة: رفع 20MB لم يعد يحجز 20MB في الـheap
 * لكل طلب متزامن. الملف المؤقّت يُنقل إلى التخزين النهائي بعد نجاح التحقق.
 */
const tmpUploadDir = path.join(os.tmpdir(), 'tender-uploads');
fsSync.mkdirSync(tmpUploadDir, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpUploadDir),
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedAttachment(file.originalname)) {
      cb(
        new AppError(
          422,
          'INVALID_FILE_TYPE',
          `نوع الملف غير مسموح (.${fileExtension(file.originalname) || 'غير معروف'})`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/** يحوّل أخطاء multer إلى AppError موحّد */
export function mapUploadError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'FILE_TOO_LARGE', `حجم الملف يتجاوز الحد المسموح (${MAX_ATTACHMENT_MB}MB)`);
    }
    return new AppError(422, 'UPLOAD_ERROR', 'تعذر رفع الملف');
  }
  return new AppError(422, 'UPLOAD_ERROR', 'تعذر رفع الملف');
}

// M5.2 — تحميل مرفق. H1.1 — مقيَّد بعلاقة المستخدم بالمناقصة (إصلاح BOLA)
export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

// الأدوار الإشرافية التي تقرأ كل المناقصات (مطابق لسياسة القراءة في مستند 02)
const DOWNLOAD_SUPERVISORY_ROLES: Role[] = ['QA', 'MANAGER', 'OWNER', 'ADMIN'];

attachmentsRouter.get('/:id/download', async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: { tender: { select: { createdById: true, currentAssigneeId: true } } },
    });
    if (!attachment) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود');

    // H1.1 — يُسمح بالتنزيل للأدوار الإشرافية، أو منشئ المناقصة، أو مسؤولها الحالي،
    // أو من رفع المرفق نفسه؛ وإلا 403 (إصلاح الوصول المباشر بالمعرّف)
    const u = req.user!;
    const allowed =
      DOWNLOAD_SUPERVISORY_ROLES.includes(u.role) ||
      attachment.uploadedById === u.id ||
      attachment.tender.createdById === u.id ||
      attachment.tender.currentAssigneeId === u.id;
    if (!allowed) {
      throw new AppError(403, 'FORBIDDEN', 'ليست لديك صلاحية لتنزيل هذا المرفق');
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.setHeader('Content-Length', String(attachment.size));

    // H4.5 — بثّ الملف بدل قراءته كاملًا في الذاكرة
    const stream = storage.createReadStream(attachment.storagePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        next(new AppError(404, 'FILE_MISSING', 'ملف المرفق غير موجود في التخزين'));
      } else {
        res.destroy();
      }
    });
    await pipeline(stream, res).catch(() => {
      // العميل قطع الاتصال أو فشل البثّ — سُجّل عبر معالج الخطأ أعلاه
    });
  } catch (err) {
    next(err);
  }
});
