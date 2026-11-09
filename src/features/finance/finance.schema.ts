import { z } from "zod";
import { isValidDateOnly } from "../../shared/utils/businessDate.js";

const proofFileSchema = z.string().max(6_000_000).refine(
  (value) =>
    /^data:(image\/[A-Za-z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(value) ||
    (value.startsWith("https://") && z.string().url().safeParse(value).success),
  "Bukti pembayaran harus berupa URL valid atau data image/PDF."
);

export const dateOnlySchema = z
  .string({ error: "Tanggal wajib diisi dengan format YYYY-MM-DD." })
  .trim()
  .refine(
    (value) => isValidDateOnly(value),
    "Format tanggal harus YYYY-MM-DD yang valid secara kalender."
  );

export const termTriggerTypeEnum = z.enum(["date", "sprint", "manual"]);
export const termStatusEnum = z.enum(["planned", "ready", "invoiced", "paid"]);

/**
 * Validasi exhaustive pemicu tunggal (AC-3.1, BR-TERM-01, BR-TERM-02):
 * Satu termin tepat satu dari `date` | `sprint` | `manual`.
 * Payload field milik pemicu lain wajib ditolak.
 */
export function validateSingleTriggerFields(
  val: {
    triggerType: z.infer<typeof termTriggerTypeEnum>;
    triggerDate?: string | null;
    requiredCompletedSprints?: number | null;
    triggerSprintId?: string | null;
  },
  ctx: z.RefinementCtx
): void {
  const triggerType = val.triggerType;
  switch (triggerType) {
    case "date": {
      if (!val.triggerDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerDate"],
          message: "Pemicu 'date' wajib mengisi triggerDate (YYYY-MM-DD).",
        });
      }
      if (val.requiredCompletedSprints !== undefined && val.requiredCompletedSprints !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requiredCompletedSprints"],
          message: "Pemicu 'date' tidak boleh menyertakan requiredCompletedSprints.",
        });
      }
      if (val.triggerSprintId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerSprintId"],
          message: "Pemicu 'date' tidak boleh menyertakan triggerSprintId.",
        });
      }
      return;
    }

    case "sprint": {
      if (
        val.requiredCompletedSprints === undefined ||
        val.requiredCompletedSprints === null ||
        !Number.isInteger(val.requiredCompletedSprints) ||
        val.requiredCompletedSprints < 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requiredCompletedSprints"],
          message: "Pemicu 'sprint' wajib mengisi requiredCompletedSprints berupa bilangan bulat positif (>= 1).",
        });
      }
      if (val.triggerDate !== undefined && val.triggerDate !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerDate"],
          message: "Pemicu 'sprint' tidak boleh menyertakan triggerDate.",
        });
      }
      if (val.triggerSprintId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerSprintId"],
          message: "Pemicu 'sprint' menggunakan ambang requiredCompletedSprints, bukan triggerSprintId.",
        });
      }
      return;
    }

    case "manual": {
      if (val.triggerDate !== undefined && val.triggerDate !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerDate"],
          message: "Pemicu 'manual' tidak boleh menyertakan triggerDate.",
        });
      }
      if (val.requiredCompletedSprints !== undefined && val.requiredCompletedSprints !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requiredCompletedSprints"],
          message: "Pemicu 'manual' tidak boleh menyertakan requiredCompletedSprints.",
        });
      }
      if (val.triggerSprintId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggerSprintId"],
          message: "Pemicu 'manual' tidak boleh menyertakan triggerSprintId.",
        });
      }
      return;
    }

    default: {
      const _exhaustive: never = triggerType;
      return _exhaustive;
    }
  }
}

export const termInputSchema = z
  .object({
    title: z.string().trim().min(1, "Judul termin wajib diisi").max(255),
    percentage: z
      .number()
      .positive("Persentase termin harus lebih besar dari 0")
      .max(100, "Persentase termin maksimal 100"),
    triggerType: termTriggerTypeEnum.default("manual"),
    triggerDate: dateOnlySchema.nullable().optional(),
    requiredCompletedSprints: z
      .number()
      .int("Ambang jumlah sprint harus berupa bilangan bulat.")
      .positive("Ambang jumlah sprint harus minimal 1.")
      .nullable()
      .optional(),
    triggerSprintId: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    notes: z.string().max(20_000).nullable().optional(),
  })
  .superRefine((val, ctx) => validateSingleTriggerFields(val, ctx));

/** Schema validasi pembaruan judul, catatan, atau pemicu tunggal termin pembayaran yang belum terkunci. */
export const updateTermSchema = z
  .object({
    title: z.string().trim().min(1, "Judul termin tidak boleh kosong").max(255).optional(),
    triggerType: termTriggerTypeEnum.optional(),
    triggerDate: dateOnlySchema.nullable().optional(),
    requiredCompletedSprints: z
      .number()
      .int("Ambang jumlah sprint harus berupa bilangan bulat.")
      .positive("Ambang jumlah sprint harus minimal 1.")
      .nullable()
      .optional(),
    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      (val.triggerDate !== undefined || val.requiredCompletedSprints !== undefined) &&
      !val.triggerType
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["triggerType"],
        message: "Sertakan triggerType saat mengubah konfigurasi pemicu termin.",
      });
      return;
    }
    if (val.triggerType) {
      validateSingleTriggerFields(
        {
          triggerType: val.triggerType,
          triggerDate: val.triggerDate,
          requiredCompletedSprints: val.requiredCompletedSprints,
        },
        ctx
      );
    }
  });

// AC-13 (AC-B4-1): Validasi total persentase seluruh termin wajib tepat 100%
/** Schema validasi konfigurasi kontrak proyek beserta daftar termin berbobot persis 100%. */
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

// Backward-compatible schema untuk upload BAST eksplisit
export const uploadBastSchema = z.object({
  bastUrl: proofFileSchema,
  bastFileName: z.string().max(255).optional(),
});

// BR-TERM-05: Transisi manual planned -> ready (BAST opsional)
/** Schema validasi penandaan termin siap ditagih (`planned` -> `ready`) dengan dokumen BAST opsional. */
export const markTermReadySchema = z
  .object({
    bastUrl: proofFileSchema.optional(),
    bastFileName: z.string().max(255).optional(),
    notes: z.string().max(20_000).optional(),
  })
  .optional()
  .default({});

// AC-3.3 & BR-TERM-07: Pencatatan invoice manusiawi wajib mengisi invoiceDueDate (terpisah dari triggerDate)
/** Schema validasi penerbitan invoice manual pada termin berstatus `ready` dengan `invoiceDueDate` wajib (`YYYY-MM-DD`). */
export const issueInvoiceSchema = z.object({
  invoiceNumber: z
    .string()
    .trim()
    .max(100, "Nomor invoice maksimal 100 karakter.")
    .transform((val) => (val.length === 0 ? undefined : val))
    .optional(),
  invoiceDueDate: dateOnlySchema,
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
