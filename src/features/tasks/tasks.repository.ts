import { prisma } from "../../config/db.config.js";
import { CreateTaskDto, UpdateTaskDto } from "./tasks.types.js";

export const tasksRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
    });
  },

  async findTasksByProjectId(projectId: string) {
    return prisma.task.findMany({
      where: { projectId },
      orderBy: [
        { status: "asc" },
        { order: "asc" },
        { createdAt: "asc" },
      ],
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
    });
  },

  async checkProjectDpStatus(projectId: string): Promise<boolean> {
    const payments = await prisma.payment.findMany({
      where: { projectId },
      select: { title: true, status: true },
    });

    if (payments.length === 0) {
      return false;
    }

    const verifiedDp = payments.some((p) => {
      const isVerified = p.status === "verified";
      const isDp =
        p.title.toLowerCase().includes("dp") ||
        p.title.toLowerCase().includes("down payment") ||
        p.title.toLowerCase().includes("uang muka");
      return isVerified && isDp;
    });

    // Jika ada DP terverifikasi atau pembayaran pertama sudah terverifikasi
    return verifiedDp || payments.some((p) => p.status === "verified");
  },

  async findById(id: string) {
    return prisma.task.findUnique({
      where: { id },
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
    });
  },

  async getNextOrder(projectId: string, status: string): Promise<number> {
    const lastTask = await prisma.task.findFirst({
      where: { projectId, status },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    return lastTask ? lastTask.order + 1 : 0;
  },

  async create(projectId: string, data: CreateTaskDto) {
    return prisma.task.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        status: data.status || "todo",
        priority: data.priority || "medium",
        order: data.order ?? 0,
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        assigneeRole: data.assigneeRole,
      },
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
    });
  },

  async update(id: string, data: UpdateTaskDto) {
    return prisma.task.update({
      where: { id },
      data,
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
    });
  },

  async delete(id: string) {
    return prisma.task.delete({
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
