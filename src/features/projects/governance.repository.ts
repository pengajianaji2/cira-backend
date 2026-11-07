import { prisma } from "../../config/db.config.js";
import {
  AddRosterMemberDto,
  CreateRepoLinkDto,
  CreateStatusRequestDto,
  ProjectRepoType,
  SubmitVoteDto,
  UpdateRepoLinkDto,
} from "./governance.types.js";

export const governanceRepository = {
  // ==========================================
  // ROSTER REPOSITORY
  // ==========================================
  async getRoster(projectId: string) {
    return prisma.projectRoster.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
            whatsapp: true,
            instagram: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });
  },

  async findRosterMember(projectId: string, userId: string) {
    return prisma.projectRoster.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
            isActive: true,
          },
        },
      },
    });
  },

  async addRosterMember(projectId: string, dto: AddRosterMemberDto) {
    return prisma.projectRoster.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: dto.userId,
        },
      },
      create: {
        projectId,
        userId: dto.userId,
        roleInProject: dto.roleInProject,
      },
      update: {
        roleInProject: dto.roleInProject,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });
  },

  async removeRosterMember(projectId: string, userId: string) {
    return prisma.projectRoster.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  },

  async countRoster(projectId: string) {
    return prisma.projectRoster.count({
      where: { projectId },
    });
  },

  // ==========================================
  // STATUS REQUESTS & VOTING REPOSITORY
  // ==========================================
  async findActivePendingRequest(projectId: string) {
    return prisma.projectStatusRequest.findFirst({
      where: {
        projectId,
        status: "pending",
      },
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
      },
    });
  },

  async findRequestById(reqId: string) {
    return prisma.projectStatusRequest.findUnique({
      where: { id: reqId },
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
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            ownerId: true,
          },
        },
      },
    });
  },

  async listRequests(projectId: string) {
    return prisma.projectStatusRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
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
    });
  },

  async createStatusRequestWithInitialVote(
    projectId: string,
    dto: CreateStatusRequestDto,
    requestedById: string
  ) {
    return prisma.$transaction(async (tx) => {
      const request = await tx.projectStatusRequest.create({
        data: {
          projectId,
          targetStatus: dto.targetStatus,
          reason: dto.reason,
          status: "pending",
          requestedById,
        },
      });

      // Pemohon otomatis dihitung setuju (1 vote approve) (AC-B2-1)
      await tx.projectStatusVote.create({
        data: {
          requestId: request.id,
          userId: requestedById,
          vote: "approve",
          reason: "Pemohon otomatis menyetujui permohonan",
        },
      });

      return tx.projectStatusRequest.findUnique({
        where: { id: request.id },
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
        },
      });
    });
  },

  async findVote(requestId: string, userId: string) {
    return prisma.projectStatusVote.findUnique({
      where: {
        requestId_userId: {
          requestId,
          userId,
        },
      },
    });
  },

  async createVote(requestId: string, userId: string, dto: SubmitVoteDto) {
    return prisma.projectStatusVote.create({
      data: {
        requestId,
        userId,
        vote: dto.vote,
        reason: dto.reason,
      },
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
    });
  },

  async resolveStatusRequest(
    reqId: string,
    status: "approved" | "rejected",
    finalData?: {
      finalDecisionById?: string;
      finalDecision?: "approve" | "reject";
      finalReason?: string;
      finalDecisionAt?: Date;
    }
  ) {
    return prisma.projectStatusRequest.update({
      where: { id: reqId },
      data: {
        status,
        finalDecisionById: finalData?.finalDecisionById,
        finalDecision: finalData?.finalDecision,
        finalReason: finalData?.finalReason,
        finalDecisionAt: finalData?.finalDecisionAt,
      },
    });
  },

  async updateProjectStatus(projectId: string, status: string) {
    return prisma.project.update({
      where: { id: projectId },
      data: { status },
    });
  },

  // ==========================================
  // REPOSITORY LINKS REPOSITORY
  // ==========================================
  async listRepositories(projectId: string) {
    return prisma.projectRepositoryLink.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
  },

  async findRepositoryById(id: string) {
    return prisma.projectRepositoryLink.findUnique({
      where: { id },
    });
  },

  async createRepository(projectId: string, dto: CreateRepoLinkDto) {
    return prisma.projectRepositoryLink.create({
      data: {
        projectId,
        label: dto.label,
        url: dto.url,
      },
    });
  },

  async updateRepository(id: string, dto: UpdateRepoLinkDto) {
    return prisma.projectRepositoryLink.update({
      where: { id },
      data: dto,
    });
  },

  async deleteRepository(id: string) {
    return prisma.projectRepositoryLink.delete({
      where: { id },
    });
  },

  async updateProjectRepoType(projectId: string, repoType: ProjectRepoType) {
    return prisma.project.update({
      where: { id: projectId },
      data: { repoType },
      select: {
        id: true,
        name: true,
        repoType: true,
      },
    });
  },

  // ==========================================
  // PRD VERSIONING REPOSITORY
  // ==========================================
  async listPrdVersions(projectId: string) {
    return prisma.prdVersion.findMany({
      where: { projectId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        charCount: true,
        description: true,
        createdAt: true,
        createdById: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
          },
        },
      },
    });
  },

  async findPrdVersionById(id: string) {
    return prisma.prdVersion.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
          },
        },
      },
    });
  },

  async findLatestPrdVersion(projectId: string) {
    return prisma.prdVersion.findFirst({
      where: { projectId },
      orderBy: { versionNumber: "desc" },
    });
  },

  async createPrdVersion(data: {
    projectId: string;
    versionNumber: number;
    compressedContent: Uint8Array<ArrayBuffer>;
    charCount: number;
    description?: string;
    createdById?: string;
  }) {
    return prisma.prdVersion.create({
      data: {
        projectId: data.projectId,
        versionNumber: data.versionNumber,
        compressedContent: data.compressedContent,
        charCount: data.charCount,
        description: data.description,
        createdById: data.createdById,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            roles: true,
          },
        },
      },
    });
  },

  async updateProjectPrdContent(projectId: string, content: string) {
    return prisma.project.update({
      where: { id: projectId },
      data: { prdContent: content },
    });
  },

  // ==========================================
  // APPEND-ONLY ACTIVITY LOG
  // ==========================================
  async logActivity(data: {
    projectId: string;
    category: string;
    action: string;
    description: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    metadata?: Record<string, any>;
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
        metadata: data.metadata ?? undefined,
      },
    });
  },
};
