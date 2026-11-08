import { Request, Response, NextFunction } from "express";
import { ServiceUnavailableError, TooManyRequestsError } from "../errors/AppError.js";
import { createHmac } from "node:crypto";
import { prisma } from "../../config/db.config.js";
import { env } from "../../config/env.config.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
let lastCleanup = 0;
export const loginRateLimit = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const key = `${req.path}:${req.ip || req.socket.remoteAddress || "unknown"}`;
  const keyHash = createHmac("sha256", env.JWT_SECRET).update(key).digest("hex");
  try {
    const result = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "auth_rate_limits" ("keyHash", "count", "resetAt", "updatedAt")
      VALUES (${keyHash}, 1, NOW() + INTERVAL '15 minutes', NOW())
      ON CONFLICT ("keyHash") DO UPDATE SET
        "count" = CASE WHEN "auth_rate_limits"."resetAt" <= NOW() THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
        "resetAt" = CASE WHEN "auth_rate_limits"."resetAt" <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "auth_rate_limits"."resetAt" END,
        "updatedAt" = NOW()
      RETURNING "count"
    `;
    if (result[0].count > MAX_ATTEMPTS) return next(new TooManyRequestsError());
    if (Date.now() - lastCleanup > 60 * 60 * 1000) {
      lastCleanup = Date.now();
      void prisma.$executeRaw`DELETE FROM "auth_rate_limits" WHERE "resetAt" < NOW() - INTERVAL '1 day'`.catch(() => undefined);
    }
    next();
  } catch {
    next(new ServiceUnavailableError("Proteksi autentikasi sementara tidak tersedia. Coba kembali."));
  }
};
