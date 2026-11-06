import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { assetsService } from "./assets.service.js";

export const assetsController = {
  async getProjectAssets(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const assets = await assetsService.getProjectAssets(projectId);
    return sendSuccess(res, "Daftar aset desain berhasil diambil", assets);
  },

  async createAsset(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const asset = await assetsService.createAsset(
      projectId,
      req.body,
      req.user
    );
    return sendSuccess(res, "Aset desain berhasil diunggah", asset, 201);
  },

  async deleteAsset(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const asset = await assetsService.deleteAsset(id, req.user);
    return sendSuccess(res, "Aset desain berhasil dihapus", asset);
  },
};
