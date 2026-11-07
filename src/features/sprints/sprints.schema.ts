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

export const createSprintSchema = z.object({
  name: z.string().trim().min(1, "Nama sprint wajib diisi").max(100),
  goal: z.string().max(2000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const updateSprintSchema = z.object({
  name: z.string().trim().min(1, "Nama sprint tidak boleh kosong").max(100).optional(),
  goal: z.string().max(2000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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
