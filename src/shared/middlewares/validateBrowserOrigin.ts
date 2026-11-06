import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";
import { getAllowedOrigins } from "../../config/cors.config.js";

const allowedOrigins = new Set(getAllowedOrigins(env.NODE_ENV, env.FRONTEND_URL));
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const validateBrowserOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  const origin = req.get("Origin");
  // Non-browser clients generally omit Origin and are authenticated explicitly.
  if (unsafeMethods.has(req.method) && origin && !allowedOrigins.has(origin)) {
    return next(new ForbiddenError("Origin request tidak diizinkan."));
  }
  next();
};
