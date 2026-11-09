/**
 * Kelas dasar error operasional aplikasi untuk membedakan kegagalan bisnis terstruktur
 * (HTTP status code dan detail validasi opsional) dari error internal tak terduga.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: any;

  constructor(message: string, statusCode = 500, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Error HTTP 400 Bad Request untuk input atau aturan bisnis yang tidak valid. */
export class BadRequestError extends AppError {
  constructor(message = "Permintaan tidak valid.", errors?: any) {
    super(message, 400, errors);
  }
}

/** Error HTTP 401 Unauthorized untuk sesi tidak valid, kedaluwarsa, atau belum login. */
export class UnauthorizedError extends AppError {
  constructor(message = "Akses ditolak. Sesi tidak valid atau telah berakhir.") {
    super(message, 401);
  }
}

/** Error HTTP 403 Forbidden untuk pelanggaran izin RBAC atau batasan akses roster proyek. */
export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki izin untuk melakukan aksi ini.") {
    super(message, 403);
  }
}

/** Error HTTP 404 Not Found ketika resource tidak ditemukan. */
export class NotFoundError extends AppError {
  constructor(message = "Data yang diminta tidak ditemukan.") {
    super(message, 404);
  }
}

/** Error HTTP 409 Conflict saat terjadi bentrok state atau constraint unik. */
export class ConflictError extends AppError {
  constructor(message = "Terjadi konflik data.") {
    super(message, 409);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Terlalu banyak percobaan. Silakan coba kembali nanti.") {
    super(message, 429);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Layanan penyimpanan file belum dikonfigurasi.") {
    super(message, 503);
  }
}
