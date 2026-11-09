import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.config.js";
import { CreateProjectDto, ProjectListingQuery, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";

export const projectsRepository = {
  async findPage(filters: ProjectListingQuery) {
    const where: Prisma.ProjectWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { clientName: { contains: filters.search, mode: "insensitive" } },
        ],
      } : {}),
    };
    const countsWhere: Prisma.ProjectWhereInput = filters.search ? {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { clientName: { contains: filters.search, mode: "insensitive" } },
      ],
    } : {};
    const [items, total, groupedCounts] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
          _count: { select: { tasks: true, payments: true, roster: true, repositoryLinks: true, prdVersions: true } },
        },
      }),
      prisma.project.count({ where }),
      prisma.project.groupBy({ by: ["status"], where: countsWhere, _count: { _all: true } }),
    ]);
    return {
      items,
      total,
      counts: Object.fromEntries(groupedCounts.map(({ status, _count }) => [status, _count._all])),
    };
  },

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
            roster: true,
            repositoryLinks: true,
            prdVersions: true,
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
        roster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                roles: true,
                avatarUrl: true,
                whatsapp: true,
                instagram: true,
                isActive: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        repositoryLinks: {
          orderBy: { createdAt: "asc" },
        },
        statusRequests: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            votes: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    roles: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            requestedBy: {
              select: {
                id: true,
                name: true,
                email: true,
                roles: true,
              },
            },
            finalDecisionBy: {
              select: {
                id: true,
                name: true,
                email: true,
                roles: true,
              },
            },
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

  async create(data: CreateProjectDto & { ownerId?: string }, tx: Prisma.TransactionClient = prisma) {
    return tx.project.create({
      data: {
        name: data.name,
        clientName: data.clientName,
        clientContact: data.clientContact,
        contractValue: data.contractValue ?? 0,
        prdContent: data.prdContent,
        repoType: data.repoType ?? "monorepo",
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

  async update(id: string, data: UpdateProjectDto, tx: Prisma.TransactionClient = prisma) {
    return tx.project.update({
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

  async updateContractValue(id: string, contractValue: number, tx: Prisma.TransactionClient = prisma) {
    return tx.project.update({ where: { id }, data: { contractValue } });
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
  }, tx: Prisma.TransactionClient = prisma) {
    return tx.activityLog.create({
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
