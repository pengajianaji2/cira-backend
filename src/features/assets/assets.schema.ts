import { z } from "zod";

export const createDesignAssetSchema = z.object({
  name: z.string().trim().min(1, "Nama aset wajib diisi").max(255),
  originalSize: z.number().int().positive("originalSize harus berupa integer positif"),
  publicId: z.string().uuid(),
  compressionRatio: z.number().int().min(0).max(100, "Rasio kompresi berkisar antara 0 - 100"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

export const createAssetUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  originalSize: z.number().int().positive().max(20_000_000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

export const cleanupAssetUploadSchema = z.object({
  projectId: z.string().min(1),
  publicId: z.string().uuid(),
});
