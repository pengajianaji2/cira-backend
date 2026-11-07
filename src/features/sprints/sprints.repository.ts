import { prisma } from "../../config/db.config.js";
import { CreateSprintDto, UpdateSprintDto } from "./sprints.types.js";

export const sprintsRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
    });
  },

  async findSprintsByProjectId(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        tasks: {
          orderBy: [{ status: "asc" }, { order: "asc" }],
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.sprint.findUnique({
      where: { id },
      include: {
        project: true,
        tasks: {
          orderBy: [{ status: "asc" }, { order: "asc" }],
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  async findActiveSprintByProjectId(projectId: string) {
    return prisma.sprint.findFirst({
      where: {
        projectId,
        status: "active",
      },
      include: {
        tasks: true,
      },
    });
  },

  async create(projectId: string, dto: CreateSprintDto) {
    return prisma.sprint.create({
      data: {
        projectId,
        name: dto.name,
        goal: dto.goal,
        status: "planning",
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: {
        tasks: true,
      },
    });
  },

  async update(id: string, data: UpdateSprintDto & { status?: string; completedAt?: Date | null }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.goal !== undefined) updateData.goal = data.goal;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    }

    return prisma.sprint.update({
      where: { id },
      data: updateData,
      include: {
        tasks: {
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  async delete(id: string) {
    return prisma.sprint.delete({
      where: { id },
    });
  },

  async findTasksByIds(taskIds: string[]) {
    return prisma.task.findMany({
      where: {
        id: { in: taskIds },
      },
    });
  },

  async assignTasksToSprint(sprintId: string, taskIds: string[]) {
    return prisma.task.updateMany({
      where: {
        id: { in: taskIds },
      },
      data: {
        sprintId,
      },
    });
  },

  async removeTaskFromSprint(taskId: string) {
    return prisma.task.update({
      where: { id: taskId },
      data: { sprintId: null },
    });
  },

  async calculateCumulativeProgress(projectId: string): Promise<{
    totalScopePoints: number;
    completedPoints: number;
    progress: number;
  }> {
    // 1. Total points seluruh task yang memiliki storyPoints dalam proyek (scope disetujui)
    const allScopedTasks = await prisma.task.findMany({
      where: {
        projectId,
        storyPoints: { not: null },
      },
      select: {
        id: true,
        storyPoints: true,
        status: true,
        sprintId: true,
        sprint: {
          select: {
            status: true,
          },
        },
      },
    });

    const totalScopePoints = allScopedTasks.reduce(
      (sum, task) => sum + (task.storyPoints ?? 0),
      0
    );

    // 2. Points dari task yang berada dalam sprint yang telah selesai ('completed') dan task tersebut 'done'
    const completedTasks = allScopedTasks.filter(
      (task) => task.sprint?.status === "completed" && task.status === "done"
    );

    const completedPoints = completedTasks.reduce(
      (sum, task) => sum + (task.storyPoints ?? 0),
      0
    );

    const progress =
      totalScopePoints > 0
        ? Math.min(100, Math.round((completedPoints / totalScopePoints) * 10000) / 100)
        : 0;

    return {
      totalScopePoints,
      completedPoints,
      progress,
    };
  },

  async updateProjectProgress(projectId: string, progress: number) {
    return prisma.project.update({
      where: { id: projectId },
      data: { progress },
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
