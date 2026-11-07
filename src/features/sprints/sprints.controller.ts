import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { sprintsService } from "./sprints.service.js";

export const sprintsController = {
  async getProjectSprints(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const sprints = await sprintsService.getSprintsByProjectId(projectId);
    return sendSuccess(res, "Daftar sprint proyek berhasil diambil", sprints);
  },

  async getSprintById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const sprint = await sprintsService.getSprintById(id);
    return sendSuccess(res, "Data sprint berhasil diambil", sprint);
  },

  async createSprint(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const sprint = await sprintsService.createSprint(projectId, req.body, req.user);
    return sendSuccess(res, "Sprint berhasil dibuat", sprint, 201);
  },

  async updateSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const sprint = await sprintsService.updateSprint(id, req.body, req.user);
    return sendSuccess(res, "Sprint berhasil diperbarui", sprint);
  },

  async startSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const sprint = await sprintsService.startSprint(id, req.user);
    return sendSuccess(res, `Sprint "${sprint.name}" berhasil dimulai`, sprint);
  },

  async completeSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const result = await sprintsService.completeSprint(id, req.user);
    return sendSuccess(res, `Sprint "${result.sprint.name}" berhasil diselesaikan`, result);
  },

  async reopenSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const result = await sprintsService.reopenSprint(id, req.user);
    return sendSuccess(res, `Sprint "${result.sprint.name}" berhasil dibuka kembali`, result);
  },

  async deleteSprint(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const result = await sprintsService.deleteSprint(id, req.user);
    return sendSuccess(res, "Sprint berhasil dihapus", result);
  },

  async assignTasks(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const result = await sprintsService.assignTasks(id, req.body, req.user);
    return sendSuccess(res, "Task berhasil dimasukkan ke dalam sprint", result);
  },

  async getProjectProgress(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const progress = await sprintsService.getProjectCumulativeProgress(projectId);
    return sendSuccess(res, "Progres kumulatif proyek berhasil diambil", progress);
  },
};
