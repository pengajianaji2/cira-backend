import { randomBytes, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";

export const createCsrfToken = (): string => randomBytes(32).toString("hex");

export const validateCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const cookie = req.cookies?.csrfToken;
  const header = req.get("X-CSRF-Token");
  if (!cookie || !header) return next(new ForbiddenError("Token CSRF tidak ditemukan."));
  const expected = Buffer.from(cookie);
  const supplied = Buffer.from(header);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return next(new ForbiddenError("Token CSRF tidak valid."));
  }
  next();
};

export const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  maxAge: 2 * 60 * 60 * 1000,
});
