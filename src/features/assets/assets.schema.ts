import { z } from "zod";

export const createDesignAssetSchema = z.object({
  name: z.string().trim().min(1, "Nama aset wajib diisi").max(255),
  originalSize: z.number().int().positive("originalSize harus berupa integer positif"),
  compressedSize: z.number().int().positive("compressedSize harus berupa integer positif"),
  compressionRatio: z.number().int().min(0).max(100, "Rasio kompresi berkisar antara 0 - 100"),
  dataUrl: z.string().max(2_600_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
}).refine((value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`), {
  message: "Tipe MIME harus sesuai dengan data gambar.",
  path: ["mimeType"],
});
