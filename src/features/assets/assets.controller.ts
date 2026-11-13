import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { assetsService } from "./assets.service.js";
export const assetsController = {
  async getProjectAssets(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, "Daftar aset desain berhasil diambil", await assetsService.getProjectAssets(req.params.projectId as string));
  },
  async createAsset(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, "Aset desain berhasil diunggah", await assetsService.createAsset(req.params.projectId as string, req.body, req.user!), 201);
  },
  async deleteAsset(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, "Aset desain berhasil dihapus", await assetsService.deleteAsset(req.params.id as string, req.user!));
  },
};
