import { Router } from 'express';
import multer from 'multer';
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

/** إعداد multer: تخزين في الذاكرة + حد الحجم + فلتر الأنواع المسموحة (M5.1) */
export const upload = multer({
  storage: multer.memoryStorage(),
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

// M5.2 — تحميل مرفق (للمصرح لهم فقط: أي مستخدم مصادَق)
export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.get('/:id/download', async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود');

    let data: Buffer;
    try {
      data = await storage.read(attachment.storagePath);
    } catch {
      throw new AppError(404, 'FILE_MISSING', 'ملف المرفق غير موجود في التخزين');
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.setHeader('Content-Length', String(attachment.size));
    res.send(data);
  } catch (err) {
    next(err);
  }
});
