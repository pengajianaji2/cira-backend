import { prisma } from "../../config/db.config.js";
import { CreateDesignAssetDto } from "./assets.types.js";

export const assetsRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
  },

  async findByProjectId(projectId: string) {
    return prisma.designAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string) {
    return prisma.designAsset.findUnique({
      where: { id },
    });
  },

  async create(projectId: string, data: CreateDesignAssetDto) {
    return prisma.designAsset.create({
      data: {
        projectId,
        name: data.name,
        originalSize: data.originalSize,
        compressedSize: data.compressedSize,
        compressionRatio: data.compressionRatio,
        dataUrl: data.dataUrl,
        mimeType: data.mimeType,
      },
    });
  },

  async delete(id: string) {
    return prisma.designAsset.delete({
      where: { id },
    });
  },

  async logActivity(data: {
    projectId: string;
    category: string;
    action: string;
    description: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    metadata?: any;
  }) {
    return prisma.activityLog.create({
      data: {
        projectId: data.projectId,
        category: data.category,
        action: data.action,
        description: data.description,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        metadata: data.metadata,
      },
    });
  },
};
