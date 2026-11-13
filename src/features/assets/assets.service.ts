import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { filePath } from "../files/fileSecurity.js";
import { filesService } from "../files/files.service.js";
import { assetsRepository } from "./assets.repository.js";
import { CreateDesignAssetDto } from "./assets.types.js";

export const assetsService = {
  async getProjectAssets(projectId: string) {
    if (!(await assetsRepository.findProjectById(projectId))) throw new NotFoundError("Proyek tidak ditemukan.");
    return (await assetsRepository.findByProjectId(projectId)).map(({ file, ...asset }) => ({ ...asset, dataUrl: filePath(file.id) }));
  },
  async createAsset(projectId: string, dto: CreateDesignAssetDto, user: AuthUserPayload) {
    const result = await filesService.complete(dto.uploadSessionId, user, { category: "DESIGN", projectId }, true);
    if (!result.fileId) throw new NotFoundError("File aset tidak ditemukan.");
    const asset = await assetsRepository.findById((await assetsRepository.findByProjectId(projectId)).find((item) => item.fileId === result.fileId)?.id ?? "");
    if (!asset) throw new NotFoundError("File upload tidak ditautkan ke proyek yang diminta.");
    return { ...asset, dataUrl: filePath(asset.fileId) };
  },
  async deleteAsset(id: string, user: AuthUserPayload) {
    const asset = await assetsRepository.findById(id);
    if (!asset) throw new NotFoundError("Aset desain tidak ditemukan.");
    await filesService.remove(asset.fileId, user);
    return asset;
  },
};
