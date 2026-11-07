import zlib from "node:zlib";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { governanceRepository } from "./governance.repository.js";
import {
  AddRosterMemberDto,
  CreateRepoLinkDto,
  CreateStatusRequestDto,
  OwnerFinalDecisionDto,
  ProjectRepoType,
  SubmitVoteDto,
  UpdateRepoLinkDto,
  SavePrdVersionDto,
} from "./governance.types.js";
import { projectsRepository } from "./projects.repository.js";
import { prisma } from "../../config/db.config.js";

export const governanceService = {
  // ==========================================
  // ROSTER SERVICE
  // ==========================================
  async getRoster(projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    return governanceRepository.getRoster(projectId);
  },

  async addRosterMember(
    projectId: string,
    dto: AddRosterMemberDto,
    currentUser: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new BadRequestError("Pengguna tidak ditemukan atau akun sedang nonaktif.");
    }

    const member = await governanceRepository.addRosterMember(projectId, dto);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "ROSTER_MEMBER_ADDED",
      description: `${targetUser.name} (${targetUser.email}) ditambahkan ke roster voting proyek.`,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.roles?.[0],
      metadata: { targetUserId: targetUser.id, roleInProject: dto.roleInProject },
    });

    return member;
  },

  async removeRosterMember(
    projectId: string,
    userId: string,
    currentUser: AuthUserPayload
  ) {
    const existing = await governanceRepository.findRosterMember(projectId, userId);
    if (!existing) {
      throw new NotFoundError("Anggota roster tidak ditemukan dalam proyek ini.");
    }

    await governanceRepository.removeRosterMember(projectId, userId);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "ROSTER_MEMBER_REMOVED",
      description: `${existing.user.name} dihapus dari roster voting proyek.`,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.roles?.[0],
      metadata: { targetUserId: userId },
    });

    return { message: "Anggota roster berhasil dihapus" };
  },

  // ==========================================
  // STATUS REQUESTS & VOTING SERVICE
  // ==========================================
  async listStatusRequests(projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    return governanceRepository.listRequests(projectId);
  },

  async getActiveStatusRequest(projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    return governanceRepository.findActivePendingRequest(projectId);
  },

  async createStatusRequest(
    projectId: string,
    dto: CreateStatusRequestDto,
    user: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    if (dto.targetStatus === project.status) {
      throw new BadRequestError(
        `Target status '${dto.targetStatus}' sama dengan status proyek saat ini.`
      );
    }

    // Pastikan pemohon adalah anggota roster atau Owner
    const isOwner = user.roles.map((r) => r.toLowerCase()).includes("owner");
    const rosterMember = await governanceRepository.findRosterMember(projectId, user.id);

    if (!rosterMember && !isOwner) {
      throw new ForbiddenError(
        "Hanya anggota roster proyek atau Owner yang berhak mengajukan permohonan perubahan status."
      );
    }

    // Jika pemohon adalah Owner dan belum ada di roster, daftarkan ke roster proyek
    if (!rosterMember && isOwner) {
      await governanceRepository.addRosterMember(projectId, {
        userId: user.id,
        roleInProject: "owner",
      });
    }

    // Cek apakah masih ada permohonan pending
    const existingPending = await governanceRepository.findActivePendingRequest(projectId);
    if (existingPending) {
      throw new BadRequestError(
        "Masih ada permohonan perubahan status yang berstatus pending. Tunggu voting selesai atau arbitrase Owner."
      );
    }

    // Buat request dengan vote setuju otomatis untuk pemohon (AC-B2-1)
    const request = await governanceRepository.createStatusRequestWithInitialVote(
      projectId,
      dto,
      user.id
    );

    if (!request) {
      throw new BadRequestError("Gagal membuat permohonan perubahan status.");
    }

    // Cek total anggota roster
    const rosterCount = await governanceRepository.countRoster(projectId);

    // Jika pemohon adalah satu-satunya anggota roster (100% konsensus tercapai seketika)
    if (rosterCount <= 1) {
      await governanceRepository.resolveStatusRequest(request.id, "approved");
      await governanceRepository.updateProjectStatus(projectId, dto.targetStatus);

      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_CHANGE_CONSENSUS",
        description: `Status proyek "${project.name}" otomatis disetujui menjadi "${dto.targetStatus}" (konsensus tunggal roster 1/1).`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: request.id,
          previousStatus: project.status,
          newStatus: dto.targetStatus,
          targetStatus: dto.targetStatus,
          totalVotes: 1,
          rosterCount: 1,
        },
      });

      return {
        ...request,
        status: "approved",
        projectStatusUpdated: true,
      };
    }

    // Catat log pengajuan status (menunggu roster lain)
    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "STATUS_REQUEST_SUBMITTED",
      description: `Pengajuan perubahan status proyek ke "${dto.targetStatus}" dibuat oleh ${user.name}. Menunggu voting ${rosterCount} anggota roster.`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: {
        requestId: request.id,
        targetStatus: dto.targetStatus,
        reason: dto.reason,
        rosterCount,
      },
    });

    return request;
  },

  async submitVote(
    projectId: string,
    reqId: string,
    dto: SubmitVoteDto,
    user: AuthUserPayload
  ) {
    const request = await governanceRepository.findRequestById(reqId);
    if (!request || request.projectId !== projectId) {
      throw new NotFoundError("Permohonan status tidak ditemukan pada proyek ini.");
    }

    if (request.status !== "pending") {
      throw new BadRequestError("Permohonan status ini sudah diselesaikan dan tidak menerima vote lagi.");
    }

    // Validasi pemilih adalah anggota roster
    const rosterMember = await governanceRepository.findRosterMember(projectId, user.id);
    if (!rosterMember) {
      throw new ForbiddenError("Hanya anggota roster proyek yang berhak memberikan suara (vote).");
    }

    // Validasi apakah pengguna sudah pernah voting
    const existingVote = await governanceRepository.findVote(reqId, user.id);
    if (existingVote) {
      throw new BadRequestError("Anda sudah memberikan suara pada permohonan status ini.");
    }

    // Catat vote baru
    await governanceRepository.createVote(reqId, user.id, dto);

    // Ambil seluruh vote terkini beserta jumlah anggota roster
    const updatedRequest = await governanceRepository.findRequestById(reqId);
    const rosterCount = await governanceRepository.countRoster(projectId);
    const votes = updatedRequest?.votes || [];
    const totalVotes = votes.length;
    const approveCount = votes.filter((v) => v.vote === "approve").length;
    const rejectCount = votes.filter((v) => v.vote === "reject").length;

    // AC-B2-2: Jika SELURUH anggota roster telah vote dan 100% "approve"
    if (totalVotes >= rosterCount && approveCount === rosterCount) {
      await governanceRepository.resolveStatusRequest(reqId, "approved");
      await governanceRepository.updateProjectStatus(projectId, request.targetStatus);

      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_CHANGE_CONSENSUS",
        description: `Status proyek "${request.project.name}" berhasil diubah menjadi "${request.targetStatus}" melalui konsensus 100% voting roster (${approveCount}/${rosterCount}).`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: reqId,
          previousStatus: request.project.status,
          newStatus: request.targetStatus,
          targetStatus: request.targetStatus,
          totalVotes,
          rosterCount,
        },
      });

      return {
        ...updatedRequest,
        status: "approved",
        projectStatusUpdated: true,
      };
    }

    // Jika ada penolakan, catat aktivitas bahwa voting terhambat penolakan
    if (dto.vote === "reject") {
      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_VOTE_REJECTED",
        description: `${user.name} memberikan suara MENOLAK pengajuan status ke "${request.targetStatus}". Menunggu arbitrase final Owner.`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: reqId,
          reason: dto.reason,
          rejectCount,
        },
      });
    } else {
      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_VOTE_RECORDED",
        description: `${user.name} memberikan suara MENYETUJUI pengajuan status ke "${request.targetStatus}".`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: reqId,
          approveCount,
          rosterCount,
        },
      });
    }

    return updatedRequest;
  },

  async ownerFinalDecision(
    projectId: string,
    reqId: string,
    dto: OwnerFinalDecisionDto,
    user: AuthUserPayload
  ) {
    const request = await governanceRepository.findRequestById(reqId);
    if (!request || request.projectId !== projectId) {
      throw new NotFoundError("Permohonan status tidak ditemukan pada proyek ini.");
    }

    if (request.status !== "pending") {
      throw new BadRequestError("Permohonan status ini sudah diselesaikan sebelumnya.");
    }

    const now = new Date();

    if (dto.decision === "approve") {
      await governanceRepository.resolveStatusRequest(reqId, "approved", {
        finalDecisionById: user.id,
        finalDecision: "approve",
        finalReason: dto.reason,
        finalDecisionAt: now,
      });

      await governanceRepository.updateProjectStatus(projectId, request.targetStatus);

      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_CHANGE_OWNER_OVERRIDE",
        description: `Owner (${user.name}) mengeksekusi arbitrase akhir: MENYETUJUI pengajuan status ke "${request.targetStatus}". Status proyek resmi diperbarui.`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: reqId,
          previousStatus: request.project.status,
          newStatus: request.targetStatus,
          reason: dto.reason,
        },
      });

      return {
        ...request,
        status: "approved",
        finalDecision: "approve",
        finalDecisionBy: { id: user.id, name: user.name, email: user.email },
        finalReason: dto.reason,
        finalDecisionAt: now,
        projectStatusUpdated: true,
      };
    } else {
      await governanceRepository.resolveStatusRequest(reqId, "rejected", {
        finalDecisionById: user.id,
        finalDecision: "reject",
        finalReason: dto.reason,
        finalDecisionAt: now,
      });

      await governanceRepository.logActivity({
        projectId,
        category: "project",
        action: "STATUS_REQUEST_REJECTED",
        description: `Owner (${user.name}) mengeksekusi arbitrase akhir: MENOLAK pengajuan status ke "${request.targetStatus}". Status proyek tidak berubah.`,
        userId: user.id,
        userName: user.name,
        userRole: user.roles?.[0],
        metadata: {
          requestId: reqId,
          rejectedStatus: request.targetStatus,
          reason: dto.reason,
        },
      });

      return {
        ...request,
        status: "rejected",
        finalDecision: "reject",
        finalDecisionBy: { id: user.id, name: user.name, email: user.email },
        finalReason: dto.reason,
        finalDecisionAt: now,
        projectStatusUpdated: false,
      };
    }
  },

  // ==========================================
  // REPOSITORY LINKS SERVICE
  // ==========================================
  async listRepositories(projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    const repos = await governanceRepository.listRepositories(projectId);
    return {
      repoType: project.repoType || "monorepo",
      repositories: repos,
    };
  },

  async createRepository(
    projectId: string,
    dto: CreateRepoLinkDto,
    user: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const created = await governanceRepository.createRepository(projectId, dto);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "REPOSITORY_LINK_ADDED",
      description: `Tautan repositori "${dto.label}" (${dto.url}) ditambahkan.`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: { repoId: created.id, label: dto.label, url: dto.url },
    });

    return created;
  },

  async updateRepository(
    projectId: string,
    repoId: string,
    dto: UpdateRepoLinkDto,
    user: AuthUserPayload
  ) {
    const repo = await governanceRepository.findRepositoryById(repoId);
    if (!repo || repo.projectId !== projectId) {
      throw new NotFoundError("Tautan repositori tidak ditemukan pada proyek ini.");
    }

    const updated = await governanceRepository.updateRepository(repoId, dto);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "REPOSITORY_LINK_UPDATED",
      description: `Tautan repositori "${updated.label}" diperbarui.`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: { repoId, ...dto },
    });

    return updated;
  },

  async deleteRepository(
    projectId: string,
    repoId: string,
    user: AuthUserPayload
  ) {
    const repo = await governanceRepository.findRepositoryById(repoId);
    if (!repo || repo.projectId !== projectId) {
      throw new NotFoundError("Tautan repositori tidak ditemukan pada proyek ini.");
    }

    await governanceRepository.deleteRepository(repoId);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "REPOSITORY_LINK_DELETED",
      description: `Tautan repositori "${repo.label}" (${repo.url}) dihapus.`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: { repoId, label: repo.label, url: repo.url },
    });

    return { message: "Tautan repositori berhasil dihapus" };
  },

  async updateRepoType(
    projectId: string,
    repoType: ProjectRepoType,
    user: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const updated = await governanceRepository.updateProjectRepoType(projectId, repoType);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "REPO_TYPE_UPDATED",
      description: `Tipe repositori proyek diubah menjadi "${repoType}".`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: { previousRepoType: project.repoType, newRepoType: repoType },
    });

    return updated;
  },

  // ==========================================
  // PRD VERSIONING SERVICE (GZIP via node:zlib)
  // ==========================================
  async listPrdVersions(projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }
    return governanceRepository.listPrdVersions(projectId);
  },

  async getPrdVersionById(projectId: string, versionId: string) {
    const version = await governanceRepository.findPrdVersionById(versionId);
    if (!version || version.projectId !== projectId) {
      throw new NotFoundError("Versi PRD tidak ditemukan pada proyek ini.");
    }

    try {
      const decompressed = zlib.gunzipSync(version.compressedContent).toString("utf-8");
      return {
        id: version.id,
        projectId: version.projectId,
        versionNumber: version.versionNumber,
        charCount: version.charCount,
        description: version.description,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        content: decompressed,
      };
    } catch {
      throw new BadRequestError("Gagal mendekompresi konten arsip PRD.");
    }
  },

  async savePrdVersion(
    projectId: string,
    dto: SavePrdVersionDto,
    user: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const latest = await governanceRepository.findLatestPrdVersion(projectId);

    // AC-B2-4: Cek apakah konten berbeda dari versi terakhir
    if (latest) {
      try {
        const latestContent = zlib.gunzipSync(latest.compressedContent).toString("utf-8");
        if (latestContent === dto.content) {
          return {
            id: latest.id,
            versionNumber: latest.versionNumber,
            charCount: latest.charCount,
            description: latest.description,
            createdAt: latest.createdAt,
            content: latestContent,
            isNewVersion: false,
            message: "Konten PRD tidak mengalami perubahan dari versi terakhir.",
          };
        }
      } catch {
        // Jika pembacaan versi lama gagal, lanjutkan pembuatan versi baru
      }
    }

    // Kompresi konten baru menggunakan zlib.gzipSync
    const compressed = zlib.gzipSync(Buffer.from(dto.content, "utf-8"));
    const uint8Content = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength) as Uint8Array<ArrayBuffer>;
    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    const created = await governanceRepository.createPrdVersion({
      projectId,
      versionNumber: nextVersionNumber,
      compressedContent: uint8Content,
      charCount: dto.content.length,
      description: dto.description || `Versi #${nextVersionNumber}`,
      createdById: user.id,
    });

    // Update project.prdContent
    await governanceRepository.updateProjectPrdContent(projectId, dto.content);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "PRD_VERSION_CREATED",
      description: `Versi PRD #${nextVersionNumber} berhasil disimpan (${dto.content.length} karakter).`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: {
        versionNumber: nextVersionNumber,
        charCount: dto.content.length,
        compressedSize: compressed.length,
      },
    });

    return {
      id: created.id,
      versionNumber: created.versionNumber,
      charCount: created.charCount,
      description: created.description,
      createdAt: created.createdAt,
      createdBy: created.createdBy,
      content: dto.content,
      isNewVersion: true,
      message: `Versi PRD #${nextVersionNumber} berhasil disimpan.`,
    };
  },

  async restorePrdVersion(
    projectId: string,
    versionId: string,
    user: AuthUserPayload
  ) {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const targetVersion = await governanceRepository.findPrdVersionById(versionId);
    if (!targetVersion || targetVersion.projectId !== projectId) {
      throw new NotFoundError("Versi PRD yang akan dipulihkan tidak ditemukan.");
    }

    let targetContent: string;
    try {
      targetContent = zlib.gunzipSync(targetVersion.compressedContent).toString("utf-8");
    } catch {
      throw new BadRequestError("Gagal mendekompresi konten versi PRD asal.");
    }

    const latest = await governanceRepository.findLatestPrdVersion(projectId);
    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    // AC-B2-4: When endpoint restore dipanggil, versi lama didekompresi dan disimpan sebagai versi baru di urutan teratas tanpa menimpa versi sebelumnya
    const compressed = zlib.gzipSync(Buffer.from(targetContent, "utf-8"));
    const uint8Content = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength) as Uint8Array<ArrayBuffer>;

    const restoredVersion = await governanceRepository.createPrdVersion({
      projectId,
      versionNumber: nextVersionNumber,
      compressedContent: uint8Content,
      charCount: targetContent.length,
      description: `Dipulihkan dari Versi #${targetVersion.versionNumber}`,
      createdById: user.id,
    });

    // Perbarui teks PRD aktif di project
    await governanceRepository.updateProjectPrdContent(projectId, targetContent);

    await governanceRepository.logActivity({
      projectId,
      category: "project",
      action: "PRD_VERSION_RESTORED",
      description: `Konten PRD dipulihkan dari Versi #${targetVersion.versionNumber} menjadi Versi #${nextVersionNumber}.`,
      userId: user.id,
      userName: user.name,
      userRole: user.roles?.[0],
      metadata: {
        sourceVersionNumber: targetVersion.versionNumber,
        newVersionNumber: nextVersionNumber,
        charCount: targetContent.length,
      },
    });

    return {
      id: restoredVersion.id,
      versionNumber: restoredVersion.versionNumber,
      charCount: restoredVersion.charCount,
      description: restoredVersion.description,
      createdAt: restoredVersion.createdAt,
      createdBy: restoredVersion.createdBy,
      content: targetContent,
      isNewVersion: true,
      message: `Konten PRD berhasil dipulihkan dari Versi #${targetVersion.versionNumber} menjadi Versi #${nextVersionNumber}.`,
    };
  },
};
