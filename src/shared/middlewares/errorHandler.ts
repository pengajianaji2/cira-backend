import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";

export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err instanceof AppError ? err.statusCode : 500;
  let message = err instanceof AppError && err.statusCode < 500
    ? err.message
    : "Terjadi kesalahan internal pada server.";
  let errorDetails = err instanceof AppError && err.statusCode < 500 ? err.errors : undefined;

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token sesi tidak valid.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Sesi login telah berakhir, silakan login kembali.";
  } else if (err.code === "P2002") {
    statusCode = 409;
    message = "Data sudah terdaftar di sistem (konflik unik).";
  } else if (err.code === "P2025") {
    statusCode = 404;
    message = "Data yang diminta tidak ditemukan.";
  }

  const requestId = res.locals?.requestId as string | undefined;
  if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: "error",
      event: "http_request_failed",
      ...(requestId ? { requestId } : {}),
      method: req.method,
      path: req.path,
      statusCode,
      errorName: typeof err?.name === "string" ? err.name : "UnknownError",
      errorCode: typeof err?.code === "string" ? err.code : undefined,
    }));
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errorDetails,
    ...(requestId ? { requestId } : {}),
  });
};
