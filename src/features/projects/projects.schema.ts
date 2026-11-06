import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi").max(255),
  clientName: z.string().trim().min(1, "Nama klien wajib diisi").max(255),
  clientContact: z.string().trim().min(1, "Kontak klien wajib diisi").max(500),
  contractValue: z.number().nonnegative("Nilai kontrak tidak boleh negatif").optional(),
  prdContent: z.string().max(200_000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek tidak boleh kosong").max(255).optional(),
  clientName: z.string().trim().min(1, "Nama klien tidak boleh kosong").max(255).optional(),
  clientContact: z.string().trim().min(1, "Kontak klien tidak boleh kosong").max(500).optional(),
  status: z.enum(["lead", "active", "completed", "cancelled"]).optional(),
  contractValue: z.number().nonnegative("Nilai kontrak tidak boleh negatif").optional(),
  prdContent: z.string().max(200_000).optional(),
});

export const projectQuerySchema = z.object({
  status: z.enum(["lead", "active", "completed", "cancelled"]).optional(),
  search: z.string().max(200).optional(),
});

export const projectIdParamSchema = z.object({
  id: z.string().min(1, "ID proyek wajib disertakan"),
});

export const projectParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
});
