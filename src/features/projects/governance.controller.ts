import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { governanceService } from "./governance.service.js";

const getProjectId = (req: Request): string => {
  return (req.params.projectId || req.params.id) as string;
};

/** HTTP controller tata kelola proyek US-2: voting roster, pengajuan & arbitrase status, link repositori, dan versioning PDF PRD. */
export const governanceController = {
  // ==========================================
  // ROSTER CONTROLLERS
  // ==========================================
  async getRoster(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const roster = await governanceService.getRoster(projectId);
    return sendSuccess(res, "Daftar roster proyek berhasil diambil", roster);
  },

  async addRosterMember(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const member = await governanceService.addRosterMember(
      projectId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Anggota berhasil ditambahkan ke roster", member, 201);
  },

  async removeRosterMember(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const userId = req.params.userId as string;
    const result = await governanceService.removeRosterMember(
      projectId,
      userId,
      req.user!
    );
    return sendSuccess(res, "Anggota berhasil dihapus dari roster", result);
  },

  // ==========================================
  // STATUS REQUESTS & VOTING CONTROLLERS
  // ==========================================
  async listStatusRequests(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const requests = await governanceService.listStatusRequests(projectId);
    return sendSuccess(res, "Daftar permohonan status berhasil diambil", requests);
  },

  async getActiveStatusRequest(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const request = await governanceService.getActiveStatusRequest(projectId);
    return sendSuccess(res, "Status permohonan aktif berhasil diambil", request);
  },

  async createStatusRequest(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const request = await governanceService.createStatusRequest(
      projectId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Permohonan perubahan status berhasil diajukan", request, 201);
  },

  async submitVote(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const reqId = req.params.reqId as string;
    const result = await governanceService.submitVote(
      projectId,
      reqId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Suara voting berhasil dicatat", result);
  },

  async ownerFinalDecision(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const reqId = req.params.reqId as string;
    const result = await governanceService.ownerFinalDecision(
      projectId,
      reqId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Keputusan arbitrase Owner berhasil dieksekusi", result);
  },

  // ==========================================
  // REPOSITORY LINKS CONTROLLERS
  // ==========================================
  async listRepositories(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const data = await governanceService.listRepositories(projectId);
    return sendSuccess(res, "Daftar tautan repositori berhasil diambil", data);
  },

  async createRepository(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const repo = await governanceService.createRepository(
      projectId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Tautan repositori berhasil ditambahkan", repo, 201);
  },

  async updateRepository(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const repoId = req.params.repoId as string;
    const repo = await governanceService.updateRepository(
      projectId,
      repoId,
      req.body,
      req.user!
    );
    return sendSuccess(res, "Tautan repositori berhasil diperbarui", repo);
  },

  async deleteRepository(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const repoId = req.params.repoId as string;
    const result = await governanceService.deleteRepository(
      projectId,
      repoId,
      req.user!
    );
    return sendSuccess(res, "Tautan repositori berhasil dihapus", result);
  },

  async updateRepoType(req: Request, res: Response): Promise<Response> {
    const projectId = getProjectId(req);
    const result = await governanceService.updateRepoType(
      projectId,
      req.body.repoType,
      req.user!
    );
    return sendSuccess(res, "Tipe repositori proyek berhasil diperbarui", result);
  },

  // ==========================================
  // PRD VERSIONING CONTROLLERS
  // ==========================================

};
