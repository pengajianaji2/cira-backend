import { z } from "zod";

export const createDesignAssetSchema = z.object({
  uploadSessionId: z.string().uuid(),
}).strict();

export const createAssetUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  originalSize: z.number().int().positive().max(20_000_000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

export const cleanupAssetUploadSchema = z.object({
  projectId: z.string().min(1),
  publicId: z.string().uuid(),
});
