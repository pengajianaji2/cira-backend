import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional().default("postgresql://postgres:postgres@localhost:5432/postgres"),
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
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Konfigurasi environment tidak valid:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

const cloudinaryValues = [env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET];
if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
  throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET harus diisi bersama.");
}

if (env.NODE_ENV === "production") {
  const frontendOrigin = new URL(env.FRONTEND_URL);
  if (frontendOrigin.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(frontendOrigin.hostname)) {
    throw new Error("FRONTEND_URL production harus berupa origin HTTPS publik.");
  }
}
