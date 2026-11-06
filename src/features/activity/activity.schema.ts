import { z } from "zod";

export const activityCategoryEnum = z.enum([
  "project",
  "task",
  "finance",
  "asset",
  "auth",
]);

export const createActivitySchema = z.object({
  category: activityCategoryEnum,
  action: z.string().trim().min(1, "Aksi aktivitas wajib diisi").max(100),
  description: z.string().trim().min(1, "Deskripsi aktivitas wajib diisi").max(20_000),
  metadata: z.any().optional(),
});

export const activityFilterQuerySchema = z.object({
  category: activityCategoryEnum.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
