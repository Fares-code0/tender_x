import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

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
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
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

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
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
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع' } });
}
