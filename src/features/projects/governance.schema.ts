import { z } from "zod";

export const addRosterMemberSchema = z.object({
  userId: z.string().min(1, "ID pengguna wajib disertakan"),
  roleInProject: z.string().trim().max(100).optional(),
});

export const createStatusRequestSchema = z.object({
  targetStatus: z.enum(["lead", "active", "completed", "cancelled"], {
    error: "Target status tidak valid. Pilihan: lead, active, completed, cancelled",
  }),
  reason: z
    .string()
    .trim()
    .min(3, "Alasan pengajuan status minimal 3 karakter")
    .max(2000, "Alasan pengajuan status maksimal 2000 karakter"),
});

export const submitVoteSchema = z.object({
  vote: z.enum(["approve", "reject"], {
    error: "Pilihan vote hanya boleh 'approve' atau 'reject'",
  }),
  reason: z.string().trim().max(2000).optional(),
});

export const ownerFinalDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"], {
    error: "Keputusan hanya boleh 'approve' atau 'reject'",
  }),
  reason: z.string().trim().max(2000).optional(),
});

export const createRepoLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label repositori wajib diisi")
    .max(100, "Label repositori maksimal 100 karakter"),
  url: z
    .string()
    .trim()
    .url("Format URL repositori tidak valid")
    .max(1000, "URL repositori maksimal 1000 karakter"),
});

export const updateRepoLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label repositori tidak boleh kosong")
    .max(100, "Label repositori maksimal 100 karakter")
    .optional(),
  url: z
    .string()
    .trim()
    .url("Format URL repositori tidak valid")
    .max(1000, "URL repositori maksimal 1000 karakter")
    .optional(),
});

export const updateRepoTypeSchema = z.object({
  repoType: z.enum(["monorepo", "separate"], {
    error: "Tipe repositori harus 'monorepo' atau 'separate'",
  }),
});

export const savePrdVersionSchema = z.object({
  content: z
    .string()
    .max(500_000, "Konten PRD tidak boleh melebihi 500.000 karakter"),
  description: z.string().trim().max(500).optional(),
});

export const statusRequestIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
  reqId: z.string().min(1, "ID permohonan status wajib disertakan"),
});

export const repoIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
  repoId: z.string().min(1, "ID tautan repositori wajib disertakan"),
});

export const prdVersionIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
  versionId: z.string().min(1, "ID versi PRD wajib disertakan"),
});

export const rosterUserIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
  userId: z.string().min(1, "ID pengguna wajib disertakan"),
});
