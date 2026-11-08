import { z } from "zod";

export const FIBONACCI_VALUES = [1, 2, 3, 5, 8, 13] as const;

export const fibonacciStoryPointsSchema = z
  .number()
  .int("Story points harus berupa bilangan bulat")
  .refine(
    (val) => (FIBONACCI_VALUES as readonly number[]).includes(val),
    {
      message: "Story points wajib salah satu deret Fibonacci: 1, 2, 3, 5, 8, 13",
    }
  );

export const sprintStatusEnum = z.enum(["planning", "active", "completed"]);

/**
 * BR-SPRINT-01 — Planning. Tanggal boleh kosong.
 * Jika start dan end keduanya ada, start <= end.
 */
export const createSprintSchema = z
  .object({
    name: z.string().trim().min(1, "Nama sprint wajib diisi").max(100),
    goal: z.string().max(2000).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Tanggal mulai (startDate) tidak boleh melebihi tanggal selesai (endDate)",
      path: ["startDate"],
    }
  );

export const updateSprintSchema = z
  .object({
    name: z.string().trim().min(1, "Nama sprint tidak boleh kosong").max(100).optional(),
    goal: z.string().max(2000).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Tanggal mulai (startDate) tidak boleh melebihi tanggal selesai (endDate)",
      path: ["startDate"],
    }
  );

/**
 * BR-SPRINT-02 — Aktivasi. Wajib memiliki start dan end valid, start <= end.
 */
export const startSprintSchema = z
  .object({
    startDate: z.string().min(1, "Tanggal mulai wajib diisi untuk aktivasi sprint"),
    endDate: z.string().min(1, "Tanggal selesai wajib diisi untuk aktivasi sprint"),
  })
  .refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    {
      message: "Tanggal mulai (startDate) tidak boleh melebihi tanggal selesai (endDate)",
      path: ["startDate"],
    }
  );

/**
 * BR-SPRINT-04 — Resolusi Task saat penutupan sprint.
 * Setiap task TODO wajib memiliki targetSprintId (string atau null untuk Backlog).
 */
export const taskMoveTargetSchema = z.object({
  taskId: z.string().min(1, "ID task wajib disertakan"),
  targetSprintId: z.string().nullable(), // null = Backlog
});

export const closeSprintSchema = z.object({
  taskMoves: z.array(taskMoveTargetSchema).default([]),
});

export const assignTasksSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1, "Daftar task wajib diisi"),
});

export const sprintIdParamSchema = z.object({
  id: z.string().min(1, "ID sprint wajib disertakan"),
});

export const projectSprintParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
  sprintId: z.string().min(1, "ID sprint wajib disertakan"),
});
