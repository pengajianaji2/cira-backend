import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid."),
  password: z.string().min(6, "Password minimal 6 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
  rememberMe: z.boolean().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter."),
  email: z.string().email("Format email tidak valid."),
  whatsapp: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Nomor WhatsApp harus format internasional valid (misal: +6281234567890).").optional(),
  instagram: z.string().regex(/^[a-zA-Z0-9._]+$/, "Username Instagram hanya boleh huruf, angka, titik, dan garis bawah tanpa @.").optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Password lama wajib diisi."),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
});

export const inviteUserSchema = z.object({
  email: z.string().email("Format email tidak valid."),
  role: z.enum(["developer", "operasional"]),
});

export const activateUserSchema = z.object({
  token: z.string().min(1, "Token aktivasi wajib disertakan."),
  name: z.string().min(2, "Nama minimal 2 karakter."),
  whatsapp: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Nomor WhatsApp harus berformat internasional valid (contoh: +6281234567890)."),
  instagram: z.string().min(1, "Username Instagram wajib diisi.").regex(/^[a-zA-Z0-9._]+$/, "Username Instagram hanya boleh berisi huruf, angka, titik, dan garis bawah (tanpa @ atau URL)."),
  password: z.string().min(8, "Password minimal 8 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
  confirmPassword: z.string().optional(),
});

export const updateUserRoleSchema = z.object({
  roles: z.array(z.string()).min(1, "Minimal pilih satu role."),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean({ message: "Status aktif akun wajib disertakan." }),
});
