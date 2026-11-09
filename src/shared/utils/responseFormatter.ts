import { Response } from "express";

/** Struktur payload respons JSON seragam untuk seluruh endpoint REST API. */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

/**
 * Mengirim respons sukses terstandar (`success: true`) ke klien.
 *
 * @param res - Objek Express Response.
 * @param message - Pesan deskriptif hasil operasi.
 * @param data - Payload data opsional.
 * @param statusCode - Kode status HTTP (default `200`).
 */
export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200
): Response => {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(payload);
};

/**
 * Mengirim respons error terstandar (`success: false`) ke klien.
 *
 * @param res - Objek Express Response.
 * @param message - Pesan error untuk klien.
 * @param statusCode - Kode status HTTP (default `500`).
 * @param error - Detail validasi/diagnostik opsional.
 */
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  error?: any
): Response => {
  const payload: ApiResponse<null> = {
    success: false,
    message,
    error,
  };
  return res.status(statusCode).json(payload);
};
