import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";

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

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
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
    req.user = decoded;
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
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.some((role) => allowedRoles.includes(role))) {
    return next(new ForbiddenError());
  }
  next();
};
