import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { env } from "../../config/env.config.js";

export const errorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
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

  if (env.NODE_ENV === "development" && statusCode >= 500) {
    console.error("💥 Server Error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errorDetails,
  });
};
