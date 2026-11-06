import { prisma } from "../../config/db.config.js";
import { CreateProjectDto, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";

export const projectsRepository = {
  async findMany(filters: ProjectQueryFilter) {
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { clientName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            tasks: true,
            payments: true,
          },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        tasks: {
          orderBy: { order: "asc" },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
  },

  async create(data: CreateProjectDto & { ownerId?: string }) {
    return prisma.project.create({
      data: {
        name: data.name,
        clientName: data.clientName,
        clientContact: data.clientContact,
        contractValue: data.contractValue ?? 0,
        prdContent: data.prdContent,
        ownerId: data.ownerId,
        status: "lead",
      },
      include: {
        owner: {
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

  async update(id: string, data: UpdateProjectDto) {
    return prisma.project.update({
      where: { id },
      data,
      include: {
        owner: {
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
