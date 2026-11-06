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

export class BadRequestError extends AppError {
  constructor(message = "Permintaan tidak valid.", errors?: any) {
    super(message, 400, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Akses ditolak. Sesi tidak valid atau telah berakhir.") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki izin untuk melakukan aksi ini.") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Data yang diminta tidak ditemukan.") {
    super(message, 404);
  }
}

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
