import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid."),
  password: z.string().min(6, "Password minimal 6 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
  rememberMe: z.boolean().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter."),
  email: z.string().email("Format email tidak valid."),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Password lama wajib diisi."),
  newPassword: z.string().min(12, "Password baru minimal 12 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
});
