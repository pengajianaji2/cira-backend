import { z } from "zod";

export const taskStatusEnum = z.enum(["todo", "in_progress", "done"]);
export const taskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
export const FIBONACCI_VALUES = [1, 2, 3, 5, 8, 13] as const;

export const taskStoryPointsSchema = z
  .number()
  .int("Story points harus berupa bilangan bulat")
  .refine(
    (val) => (FIBONACCI_VALUES as readonly number[]).includes(val),
    {
      message: "Story points wajib salah satu deret Fibonacci: 1, 2, 3, 5, 8, 13",
    }
  );

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Judul task wajib diisi").max(255),
  description: z.string().max(20_000).optional(),
  status: taskStatusEnum.default("todo"),
  priority: taskPriorityEnum.default("medium"),
  order: z.number().int().nonnegative().optional(),
  storyPoints: taskStoryPointsSchema.optional(),
  sprintId: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  assigneeRole: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Judul task tidak boleh kosong").max(255).optional(),
  description: z.string().max(20_000).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  order: z.number().int().nonnegative().optional(),
  storyPoints: taskStoryPointsSchema.nullable().optional(),
  sprintId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  assigneeRole: z.string().nullable().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: taskStatusEnum,
  order: z.number().int().nonnegative().optional(),
});

export const taskIdParamSchema = z.object({
  id: z.string().min(1, "ID task wajib disertakan"),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1, "ID proyek wajib disertakan"),
});
