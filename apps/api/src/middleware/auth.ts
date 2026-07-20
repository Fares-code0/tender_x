import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token as string | undefined;
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول');
    let payload: { sub?: string };
    try {
      payload = jwt.verify(token, env.jwtSecret) as { sub?: string };
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'جلسة غير صالحة، سجّل الدخول مجددًا');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub ?? '' } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHENTICATED', 'الحساب غير موجود أو معطّل');
    }
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء'));
    }
    next();
  };
}
