import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { assetsRepository } from "./assets.repository.js";
import { CreateDesignAssetDto } from "./assets.types.js";
import { cloudinaryStorage } from "./cloudinary.service.js";

export const assetsService = {
  async getProjectAssets(projectId: string) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const assets = await assetsRepository.findByProjectId(projectId);
    return assets.map((asset) => ({ ...asset, dataUrl: cloudinaryStorage.deliveryUrl(asset.dataUrl) }));
  },

  async createAsset(
    projectId: string,
    dto: CreateDesignAssetDto,
    user?: AuthUserPayload
  ) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const storedReference = await cloudinaryStorage.upload(dto.dataUrl, `cira-pm/projects/${projectId}/assets`);
    let asset;
    try {
      asset = await assetsRepository.create(projectId, { ...dto, dataUrl: storedReference });
    } catch (error) {
      await cloudinaryStorage.destroy(storedReference);
      throw error;
    }

    await assetsRepository.logActivity({
      projectId,
      category: "asset",
      action: "UPLOAD",
      description: `Aset desain "${asset.name}" berhasil diunggah (rasio kompresi ${asset.compressionRatio}%).`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        assetId: asset.id,
        name: asset.name,
        originalSize: asset.originalSize,
        compressedSize: asset.compressedSize,
      },
    });

    return { ...asset, dataUrl: cloudinaryStorage.deliveryUrl(asset.dataUrl) };
  },

  async deleteAsset(id: string, user?: AuthUserPayload) {
    const existing = await assetsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Aset desain dengan ID '${id}' tidak ditemukan.`);
    }

    await cloudinaryStorage.destroy(existing.dataUrl);
    await assetsRepository.delete(id);

    await assetsRepository.logActivity({
      projectId: existing.projectId,
      category: "asset",
      action: "DELETE",
      description: `Aset desain "${existing.name}" dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        assetId: id,
        name: existing.name,
      },
    });

    return { ...existing, dataUrl: cloudinaryStorage.deliveryUrl(existing.dataUrl) };
  },
};
