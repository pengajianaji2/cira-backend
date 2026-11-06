import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";
import { prisma } from "../../config/db.config.js";

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  roles: string[];
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
      select: { id: true, email: true, name: true, roles: true, isActive: true },
    });

    if (!user || user.isActive === false) {
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
