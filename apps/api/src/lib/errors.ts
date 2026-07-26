import type { NextFunction, Request, Response } from 'express';
import { ZodError, type z } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** يتحقق من body بمخطط Zod ويرمي 422 بشكل الخطأ الموحد */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      result.error.issues[0]?.message ?? 'بيانات غير صالحة',
      result.error.flatten(),
    );
  }
  return result.data;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'بيانات غير صالحة', details: err.flatten() },
    });
  }
  // H3.1 — سجل منظّم بدل console.error؛ `req.log` من pino-http يحمل معرّف الطلب (H3.2)
  const log = (req as Request & { log?: { error: (obj: unknown, msg?: string) => void } }).log;
  if (log) log.error({ err }, 'unhandled error');
  else logger.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع' } });
}
