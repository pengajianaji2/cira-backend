import { prisma } from "../../config/db.config.js";
import { CreatePaymentDto, UpdatePaymentDto } from "./finance.types.js";

export const financeRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, contractValue: true },
    });
  },

  async findByProjectId(projectId: string) {
    return prisma.payment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        verifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async aggregateByProjectAndStatus(projectId: string, status: string) {
    return prisma.payment.aggregate({
      where: { projectId, status },
      _sum: { amount: true },
      _count: { _all: true },
    });
  },

  async countByProjectId(projectId: string) {
    return prisma.payment.count({ where: { projectId } });
  },

  async findById(id: string) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        verifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async create(projectId: string, data: CreatePaymentDto) {
    return prisma.payment.create({
      data: {
        projectId,
        title: data.title,
        amount: data.amount,
        dueDate: data.dueDate,
        notes: data.notes,
        proofUrl: data.proofUrl,
        proofFileName: data.proofFileName,
        proofUploadedAt: data.proofUrl ? new Date() : null,
        status: "pending",
      },
    });
  },

  async update(id: string, data: any) {
    return prisma.payment.update({
      where: { id },
      data,
      include: {
        verifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async delete(id: string) {
    return prisma.payment.delete({
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
