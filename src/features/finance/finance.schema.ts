import { z } from "zod";

const proofFileSchema = z.string().max(6_000_000).refine((value) =>
  /^data:(image\/[A-Za-z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(value) ||
  (value.startsWith("https://") && z.string().url().safeParse(value).success),
  "Bukti pembayaran harus berupa URL valid atau data image/PDF."
);

export const termTriggerTypeEnum = z.enum(["date", "sprint", "manual"]);
export const termStatusEnum = z.enum(["planned", "ready", "invoiced", "paid"]);

export const termInputSchema = z.object({
  title: z.string().trim().min(1, "Judul termin wajib diisi").max(255),
  percentage: z
    .number()
    .positive("Persentase termin harus lebih besar dari 0")
    .max(100, "Persentase termin maksimal 100"),
  triggerType: termTriggerTypeEnum.default("manual"),
  triggerSprintId: z.string().nullable().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(20_000).optional(),
});

// AC-13 (AC-B4-1): Validasi total persentase seluruh termin wajib tepat 100%
export const createContractSchema = z.object({
  contractValue: z.number().positive("Nilai kontrak harus lebih besar dari 0"),
  terms: z
    .array(termInputSchema)
    .min(1, "Minimal harus ada 1 termin dalam kontrak")
    .refine(
      (terms) => {
        const total = terms.reduce((sum, t) => sum + t.percentage, 0);
        return Math.abs(total - 100) < 0.001;
      },
      {
        message: "Total persentase seluruh termin wajib tepat 100%",
      }
    ),
});

// AC-14 (AC-B4-2): Unggah berkas BAST (PDF/JPG/PNG)
export const uploadBastSchema = z.object({
  bastUrl: proofFileSchema,
  bastFileName: z.string().max(255).optional(),
});

// AC-15 (AC-B4-3): Penerbitan invoice
export const issueInvoiceSchema = z.object({
  notes: z.string().max(20_000).optional(),
  invoicePdfUrl: z.string().optional(),
});

export const paymentTermIdParamSchema = z.object({
  id: z.string().min(1, "ID termin wajib disertakan"),
});

// Backward-compatible schemas untuk Payment existing
export const createPaymentSchema = z.object({
  title: z.string().trim().min(1, "Judul termin pembayaran wajib diisi").max(255),
  amount: z.number().positive("Nominal pembayaran harus lebih besar dari 0"),
  dueDate: z.string().optional(),
  notes: z.string().max(20_000).optional(),
  proofUrl: proofFileSchema.optional(),
  proofFileName: z.string().max(255).optional(),
});

export const updatePaymentSchema = z.object({
  title: z.string().trim().min(1, "Judul termin pembayaran tidak boleh kosong").max(255).optional(),
  amount: z.number().positive("Nominal pembayaran harus lebih besar dari 0").optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(20_000).optional(),
  proofUrl: proofFileSchema.optional(),
  proofFileName: z.string().max(255).optional(),
});

export const verifyPaymentSchema = z.object({
  verified: z.boolean({
    error: "Status verified (true/false) wajib disertakan",
  }),
});

export const paymentIdParamSchema = z.object({
  id: z.string().min(1, "ID pembayaran wajib disertakan"),
});
