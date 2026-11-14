import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.config.js";
import { CreateTaskDto, UpdateTaskDto } from "./tasks.types.js";

const taskIncludes = {
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarFileId: true,
    },
  },
  sprint: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
};

export const tasksRepository = {
  transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(work);
  },
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
      include: taskIncludes,
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

    return verifiedDp || payments.some((p) => p.status === "verified");
  },

  async findById(id: string) {
    return prisma.task.findUnique({
      where: { id },
      include: taskIncludes,
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

  async create(projectId: string, data: CreateTaskDto, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).task.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        status: data.status || "todo",
        priority: data.priority || "medium",
        order: data.order ?? 0,
        sprintId: data.sprintId,
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        assigneeRole: data.assigneeRole,
      },
      include: taskIncludes,
    });
  },

  async update(id: string, data: UpdateTaskDto, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).task.update({
      where: { id },
      data,
      include: taskIncludes,
    });
  },

  async delete(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).task.delete({
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
    metadata?: Prisma.InputJsonValue;
  }, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).activityLog.create({
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
