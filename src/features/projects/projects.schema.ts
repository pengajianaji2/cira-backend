import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
const normalizePhone=(value:unknown)=>{if(typeof value!=="string")return value;const raw=value.trim();if(!raw)return raw;const parsed=parsePhoneNumberFromString(raw,raw.startsWith("+")?undefined:"ID");return parsed?.isValid()?parsed.number:raw;};
const phoneSchema=z.preprocess(normalizePhone,z.string().refine(value=>{const parsed=parsePhoneNumberFromString(value);return Boolean(parsed?.isValid()&&parsed.number===value);},"Nomor telepon tidak valid."));

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi").max(255),
  clientName: z.string().trim().min(1, "Nama klien wajib diisi").max(255),
  clientContact: phoneSchema,
  contractValue: z.number().int("Nilai kontrak harus berupa Rupiah bulat").nonnegative("Nilai kontrak tidak boleh negatif").optional(),
  repoType: z.enum(["monorepo", "separate"]).optional(),
}).strict();

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek tidak boleh kosong").max(255).optional(),
  clientName: z.string().trim().min(1, "Nama klien tidak boleh kosong").max(255).optional(),
  clientContact: phoneSchema.optional(),
  repoType: z.enum(["monorepo", "separate"]).optional(),
}).strict();

export const projectQuerySchema = z.object({
  status: z.enum(["lead", "active", "completed", "cancelled"]).optional(),
  search: z.string().max(200).optional(),
});

export const projectListingQuerySchema = projectQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const projectIdParamSchema = z.object({
  id: z.string().min(1, "ID proyek wajib disertakan"),
});

export const projectParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
});
