import { z } from "zod";

const proofFileSchema = z.string().max(6_000_000).refine((value) =>
  /^data:(image\/[A-Za-z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(value) ||
  (value.startsWith("https://") && z.string().url().safeParse(value).success),
  "Bukti pembayaran harus berupa URL valid atau data image/PDF."
);

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
