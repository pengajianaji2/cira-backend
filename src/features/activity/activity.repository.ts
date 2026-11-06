import { prisma } from "../../config/db.config.js";
import { ActivityCategory, CreateActivityDto } from "./activity.types.js";

export const activityRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
  },

  async findByProjectId(
    projectId: string,
    filters: { category?: ActivityCategory; limit?: number }
  ) {
    const where: any = { projectId };
    if (filters.category) {
      where.category = filters.category;
    }

    return prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit || 50,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  },

  async create(
    projectId: string,
    data: CreateActivityDto & {
      userId?: string;
      userName?: string;
      userRole?: string;
    }
  ) {
    return prisma.activityLog.create({
      data: {
        projectId,
        category: data.category,
        action: data.action,
        description: data.description,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        metadata: data.metadata,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  },
};
