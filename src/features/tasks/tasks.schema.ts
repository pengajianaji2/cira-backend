import { z } from "zod";

export const taskStatusEnum = z.enum(["todo", "done"]);
export const taskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
/** Schema validasi pembuatan task yang wajib terhubung ke Sprint. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Judul task wajib diisi").max(255),
  description: z.string().max(20_000).optional(),
  status: taskStatusEnum.default("todo"),
  priority: taskPriorityEnum.default("medium"),
  order: z.number().int().nonnegative().optional(),
  sprintId: z.string().min(1, "Sprint wajib dipilih"),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  assigneeRole: z.string().optional(),
});

/** Schema validasi pembaruan atribut task (termasuk perpindahan `sprintId` dan penugasan opsional). */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Judul task tidak boleh kosong").max(255).optional(),
  description: z.string().max(20_000).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  order: z.number().int().nonnegative().optional(),
  sprintId: z.string().min(1).optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  assigneeRole: z.string().nullable().optional(),
});

/** Schema validasi transisi status checklist tunggal (`todo` atau `done`) dan urutan opsional. */
export const updateTaskStatusSchema = z.object({
  status: taskStatusEnum,
  order: z.number().int().nonnegative().optional(),
});

/** Schema validasi pemindahan task ke Sprint target. */
export const moveTaskToSprintSchema = z.object({
  targetSprintId: z.string().min(1),
});

export const taskIdParamSchema = z.object({
  id: z.string().min(1, "ID task wajib disertakan"),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
});
