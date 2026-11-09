import { z } from "zod";
import {
  diffDaysInclusive,
  isValidDateOnly,
} from "../../shared/utils/businessDate.js";

export const CALENDAR_SOURCE_TYPES = [
  "sprint",
  "payment_term",
  "invoice",
  "operational_event",
] as const;

export const OPERATIONAL_EVENT_TYPES = [
  "client_demo",
  "deployment",
  "maintenance",
  "meeting",
] as const;

export const PROJECT_STATUS_VALUES = [
  "lead",
  "active",
  "completed",
  "cancelled",
] as const;

const dateOnlySchema = z
  .string({ error: "Tanggal harus berformat YYYY-MM-DD." })
  .trim()
  .refine(
    (value) => isValidDateOnly(value),
    "Format tanggal harus YYYY-MM-DD yang valid secara kalender."
  );

function coerceStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const rawList = Array.isArray(value) ? value : [value];
  const tokens = rawList
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return tokens.length > 0 ? Array.from(new Set(tokens)) : undefined;
}

const sourceTypeArraySchema = z.preprocess(
  coerceStringArray,
  z.array(z.enum(CALENDAR_SOURCE_TYPES)).optional()
);

const projectIdArraySchema = z.preprocess(
  coerceStringArray,
  z.array(z.string().min(1)).optional()
);

const projectStatusArraySchema = z.preprocess(
  coerceStringArray,
  z.array(z.enum(PROJECT_STATUS_VALUES)).optional()
);

const optionalBoolQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return value;
}, z.boolean().optional());

export const calendarQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    types: sourceTypeArraySchema,
    projectIds: projectIdArraySchema,
    projectStatuses: projectStatusArraySchema,
    includeCancelled: optionalBoolQuerySchema,
  })
  .superRefine((val, ctx) => {
    if ((val.from && !val.to) || (!val.from && val.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [val.from ? "to" : "from"],
        message: "Parameter 'from' dan 'to' wajib dikirim berpasangan.",
      });
      return;
    }

    if (val.from && val.to) {
      if (val.from > val.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: "Tanggal 'from' tidak boleh melebihi tanggal 'to'.",
        });
        return;
      }

      const spanDays = diffDaysInclusive(val.from, val.to);
      if (spanDays > 90) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: `Rentang tanggal maksimal 90 hari dalam satu permintaan (diterima ${spanDays} hari).`,
        });
      }
    }
  });

const nullableProjectIdSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().min(1, "ID proyek tidak valid.").nullable().optional()
);

function isValidIsoInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

export const createOperationalEventSchema = z
  .object({
    title: z
      .string({ error: "Judul agenda wajib diisi." })
      .trim()
      .min(2, "Judul agenda minimal 2 karakter.")
      .max(180, "Judul agenda maksimal 180 karakter."),
    eventType: z.enum(OPERATIONAL_EVENT_TYPES, {
      error: "Tipe agenda harus salah satu dari: client_demo, deployment, maintenance, meeting.",
    }),
    description: z.string().trim().max(5000).nullable().optional(),
    projectId: nullableProjectIdSchema,
    allDay: z.boolean().default(false),
    allDayStartDate: dateOnlySchema.optional(),
    allDayEndDate: dateOnlySchema.nullable().optional(),
    startAt: z.string().trim().optional(),
    endAt: z.string().trim().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.allDay) {
      const startDate =
        val.allDayStartDate ??
        (val.startAt && isValidDateOnly(val.startAt) ? val.startAt : undefined);

      if (!startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allDayStartDate"],
          message: "Agenda sepanjang hari wajib mengisi allDayStartDate (YYYY-MM-DD).",
        });
        return;
      }

      const endDate =
        val.allDayEndDate ??
        (val.endAt && isValidDateOnly(val.endAt) ? val.endAt : null);

      if (val.endAt && !isValidDateOnly(val.endAt) && !val.allDayEndDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allDayEndDate"],
          message: "Tanggal selesai agenda all-day harus berformat YYYY-MM-DD.",
        });
        return;
      }

      if (endDate && startDate > endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allDayEndDate"],
          message: "Tanggal selesai tidak boleh mendahului tanggal mulai.",
        });
      }
      return;
    }

    if (!val.startAt || !isValidIsoInstant(val.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: "Agenda terjadwal wajib mengisi waktu mulai (startAt) ISO yang valid.",
      });
      return;
    }

    if (val.endAt) {
      if (!isValidIsoInstant(val.endAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endAt"],
          message: "Waktu selesai (endAt) tidak valid.",
        });
        return;
      }
      if (new Date(val.startAt).getTime() > new Date(val.endAt).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endAt"],
          message: "Waktu selesai tidak boleh mendahului waktu mulai.",
        });
      }
    }
  });

export const updateOperationalEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Judul agenda minimal 2 karakter.")
      .max(180, "Judul agenda maksimal 180 karakter.")
      .optional(),
    eventType: z.enum(OPERATIONAL_EVENT_TYPES).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    projectId: nullableProjectIdSchema,
    allDay: z.boolean().optional(),
    allDayStartDate: dateOnlySchema.optional(),
    allDayEndDate: dateOnlySchema.nullable().optional(),
    startAt: z.string().trim().optional(),
    endAt: z.string().trim().nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.startAt && !isValidDateOnly(val.startAt) && !isValidIsoInstant(val.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: "Waktu mulai (startAt) tidak valid.",
      });
    }
    if (val.endAt && !isValidDateOnly(val.endAt) && !isValidIsoInstant(val.endAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Waktu selesai (endAt) tidak valid.",
      });
    }
  });

export const cancelOperationalEventSchema = z
  .object({
    cancelReason: z.string().trim().max(1000).optional(),
  })
  .optional()
  .default({});

export const recordReminderSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
  })
  .optional()
  .default({});

export const operationalEventIdParamSchema = z.object({
  id: z.string().trim().min(1, "ID agenda wajib disertakan."),
});
