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

    const activities = await prisma.activityLog.findMany({
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

    // User relations are optional because an account may be deleted or an
    // event may be system-generated. Keep the timeline contract stable by
    // falling back to the actor snapshot stored on the activity row.
    return activities.map(({ user, userName, userRole, ...activity }) => ({
      ...activity,
      user: user
        ? { ...user, role: userRole || "Anggota" }
        : {
            id: null,
            name: userName || "Pengguna",
            email: null,
            avatarUrl: null,
            role: userRole || "Anggota",
          },
    }));
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
