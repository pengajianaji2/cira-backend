import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { tasksService } from "./tasks.service.js";

export const tasksController = {
  async getProjectTasks(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const result = await tasksService.getTasksByProjectId(projectId);
    return sendSuccess(res, "Daftar task proyek berhasil diambil", result);
  },

  async createProjectTask(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const task = await tasksService.createTask(projectId, req.body, req.user);
    return sendSuccess(res, "Task baru berhasil dibuat", task, 201);
  },

  async updateTaskStatus(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const task = await tasksService.updateTaskStatus(id, req.body, req.user);
    return sendSuccess(res, "Status task berhasil diperbarui", task);
  },

  async moveTaskToSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const task = await tasksService.moveTaskToSprint(id, req.body, req.user);
    return sendSuccess(res, "Task berhasil dipindahkan", task);
  },

  async updateTask(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const task = await tasksService.updateTask(id, req.body, req.user);
    return sendSuccess(res, "Data task berhasil diperbarui", task);
  },

  async deleteTask(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const task = await tasksService.deleteTask(id, req.user);
    return sendSuccess(res, "Task berhasil dihapus", task);
  },
};
