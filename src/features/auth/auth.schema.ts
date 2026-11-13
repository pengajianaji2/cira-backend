import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const e164 = z.string().refine(value=>{const parsed=parsePhoneNumberFromString(value);return Boolean(parsed?.isValid()&&parsed.number===value);},"Nomor telepon tidak valid. Pilih negara dan masukkan nomor yang benar.");
const normalizePhone=(value:unknown)=>{if(typeof value!=='string')return value;const raw=value.trim();if(!raw)return null;const parsed=parsePhoneNumberFromString(raw,raw.startsWith('+')?undefined:'ID');return parsed?.isValid()?parsed.number:raw;};
const INSTAGRAM_REGEX = /^[a-zA-Z0-9._]+$/;

const normalizeOptionalContact = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
};

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid."),
  password: z.string().min(6, "Password minimal 6 karakter.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
  rememberMe: z.boolean().optional(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter."),
  email: z.string().trim().email("Format email tidak valid."),
  whatsapp: z.preprocess(
    normalizePhone,
    e164
      .nullable()
      .optional()
  ),
  instagram: z.preprocess(
    normalizeOptionalContact,
    z
      .string()
      .regex(
        INSTAGRAM_REGEX,
        "Username Instagram hanya boleh huruf, angka, titik, dan garis bawah (tanpa @ atau URL)."
      )
      .nullable()
      .optional()
  ),
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
  whatsapp: z.preprocess(normalizePhone,e164),
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

export const forgotPasswordSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) });
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(8).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password terlalu panjang."),
});
export const avatarSchema = z.object({
  uploadSessionId: z.string().uuid(),
});
export const verifyInvitationSchema = z.object({ token: z.string().min(32).max(256) });
