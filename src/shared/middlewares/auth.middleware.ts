import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";
import { prisma } from "../../config/db.config.js";
import { policiesService } from "../../features/auth/policies.service.js";

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  roles: string[];
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return next(
      new UnauthorizedError("Akses ditolak. Sesi autentikasi tidak ditemukan.")
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as AuthUserPayload;

    // Verifikasi keberadaan dan status aktif akun di database (BR-AUTH-12)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true, roles: true, isActive: true, tokenVersion: true },
    });

    if (!user || user.isActive === false || (decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return next(
        new UnauthorizedError("Akun Anda telah dinonaktifkan atau tidak ditemukan. Akses ditolak.")
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
    };
    next();
  } catch {
    next(
      new UnauthorizedError("Token tidak valid atau sesi telah berakhir.")
    );
  }
};

export const requirePermission = (permission: string) => async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user || !(await policiesService.hasAny(req.user.roles, permission))) {
    return next(new ForbiddenError("Akses ditolak. Policy role tidak mengizinkan tindakan ini."));
  }
  next();
};

export const requireAnyPermission = (...permissions: string[]) => async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    return next(new ForbiddenError("Akses ditolak. Policy role tidak mengizinkan tindakan ini."));
  }
  for (const permission of permissions) {
    if (await policiesService.hasAny(req.user.roles, permission)) {
      return next();
    }
  }
  return next(new ForbiddenError("Akses ditolak. Policy role tidak mengizinkan tindakan ini."));
};

export const requirePermissionWhenPresent = (permission: string, field: string) => async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.body?.[field] !== undefined && (!req.user || !(await policiesService.hasAny(req.user.roles, permission)))) {
    return next(new ForbiddenError("Akses ditolak. Policy role tidak mengizinkan tindakan ini."));
  }
  next();
};

export const requireAnyRole = (...allowedRoles: string[]) => (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user || !Array.isArray(req.user.roles)) {
    return next(new ForbiddenError("Akses ditolak. Peran tidak valid."));
  }
  const userRolesNormalized = req.user.roles.map((r) => r.toLowerCase());
  const allowedRolesNormalized = allowedRoles.map((r) => r.toLowerCase());
  const hasRole = userRolesNormalized.some((role) =>
    allowedRolesNormalized.includes(role)
  );

  if (!hasRole) {
    return next(new ForbiddenError("Akses ditolak. Anda tidak memiliki izin untuk tindakan ini."));
  }
  next();
};
