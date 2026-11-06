import { Request, Response, NextFunction } from "express";
import { TooManyRequestsError } from "../errors/AppError.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) attempts.delete(key);
  }
}, WINDOW_MS);
cleanupTimer.unref();

export const loginRateLimit = (req: Request, _res: Response, next: NextFunction): void => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (current.count >= MAX_ATTEMPTS) return next(new TooManyRequestsError());
  current.count += 1;
  next();
};
