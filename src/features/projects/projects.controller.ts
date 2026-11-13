import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { projectsService } from "./projects.service.js";

/** HTTP controller untuk CRUD proyek inti, pembaruan PRD, dan pembaruan nilai kontrak proyek. */
export const projectsController = {
  async createProject(req: Request, res: Response): Promise<Response> {
    const project = await projectsService.createProject(req.body, req.user);
    return sendSuccess(res, "Proyek berhasil dibuat", project, 201);
  },

  async getAllProjects(req: Request, res: Response): Promise<Response> {
    const projects = await projectsService.getAllProjects(res.locals.validatedQuery, req.user!);
    return sendSuccess(res, "Daftar proyek berhasil diambil", projects);
  },

  async getProjectPage(req: Request, res: Response): Promise<Response> {
    const result = await projectsService.getProjectPage(res.locals.validatedQuery, req.user!);
    return sendSuccess(res, "Daftar proyek berhasil diambil", result);
  },

  async getProjectById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const project = await projectsService.getProjectById(id,req.user!);
    return sendSuccess(res, "Detail proyek berhasil diambil", project);
  },

  async updateProject(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const updated = await projectsService.updateProject(id, req.body, req.user);
    return sendSuccess(res, "Data proyek berhasil diperbarui", updated);
  },

  async updateContractValue(req: Request, res: Response): Promise<Response> {
    const updated = await projectsService.updateContractValue(req.params.projectId as string, req.body.contractValue, req.user);
    return sendSuccess(res, "Nilai kontrak berhasil diperbarui.", { contractValue: updated.contractValue });
  },
};
