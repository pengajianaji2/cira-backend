import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10)),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(process.env.NODE_ENV === "production" ? 1 : 0),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  APP_PUBLIC_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  GMAIL_USER: z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional()),
  GMAIL_APP_PASSWORD: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET harus berisi minimal 32 karakter acak.")
    .refine(
      (value) =>
        !/(replace_with|change_me|example|generate_random|your[-_]super[-_]secret|cira_project_management)/i.test(
          value,
        ),
      "JWT_SECRET tidak boleh berupa placeholder.",
    ),
  JWT_EXPIRES_IN: z.string().default("7d"),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(6).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  FILE_SESSION_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  FILE_UPLOAD_MAX_AVATAR_BYTES: z.coerce.number().int().positive().max(5242880).default(5242880),
  FILE_UPLOAD_MAX_DESIGN_BYTES: z.coerce.number().int().positive().max(2097152).default(2097152),
  FILE_UPLOAD_MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().max(26214400).default(26214400),
  FILE_UPLOAD_CHUNK_BYTES: z.coerce.number().int().positive().max(4194304).multipleOf(262144).default(4194304),

});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Konfigurasi environment tidak valid:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production") {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL wajib diatur pada production.");
  }
  const databaseUrl = new URL(env.DATABASE_URL);
  if (!/^postgres(ql)?:$/.test(databaseUrl.protocol) || ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("DATABASE_URL production harus menunjuk PostgreSQL non-local.");
  }
}

// Local development may use the conventional local PostgreSQL instance.
env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/postgres";

if (Boolean(env.GMAIL_USER) !== Boolean(env.GMAIL_APP_PASSWORD)) {
  throw new Error("GMAIL_USER dan GMAIL_APP_PASSWORD harus diisi bersama.");
}


if (env.NODE_ENV === "production") {
  const frontendOrigin = new URL(env.FRONTEND_URL);
  if (frontendOrigin.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(frontendOrigin.hostname)) {
    throw new Error("FRONTEND_URL production harus berupa origin HTTPS publik.");
  }
  if (env.APP_PUBLIC_URL && new URL(env.APP_PUBLIC_URL).protocol !== "https:") {
    throw new Error("APP_PUBLIC_URL production harus menggunakan HTTPS.");
  }
} else if (env.APP_PUBLIC_URL && new URL(env.APP_PUBLIC_URL).origin !== new URL(env.FRONTEND_URL).origin) {
  console.warn("FRONTEND_URL dan APP_PUBLIC_URL berbeda. Pastikan link undangan mengarah ke frontend yang memakai backend/database environment ini.");
}
