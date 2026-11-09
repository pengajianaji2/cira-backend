import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { projectsRepository, ProjectVisibilityScope } from "./projects.repository.js";
import { CreateProjectDto, ProjectListingQuery, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";
import { cloudinaryStorage, withResolvedUserAvatar } from "../assets/cloudinary.service.js";
import { prisma } from "../../config/db.config.js";

const generateDefaultPrdContent = (projectName: string, clientName: string): string => {
  return `# PRD: ${projectName}

## 1. Problem & Context
Latar belakang proyek dan permasalahan utama yang dihadapi oleh klien ${clientName}.

## 2. Goals & Objectives
- Sasaran utama dan hasil akhir yang diharapkan dari proyek ini.
- Indikator keberhasilan (Key Results / Deliverables).

## 3. Scope of Work (Ruang Lingkup)
- Lingkup pekerjaan dan modul yang disepakati dalam kontrak.
- Non-goals (Fitur atau pekerjaan di luar cakupan saat ini).

## 4. Key Milestones & Deliverables
- Milestone 1: Desain & Arsitektur Sistem
- Milestone 2: Pengembangan Fitur Inti (Core Features)
- Milestone 3: Pengujian (QA & Testing) & Final Handover
`;
};
const gzipAsync = promisify(gzip);

const visibilityScope = (user: AuthUserPayload): ProjectVisibilityScope => {
  const roles = user.roles.map((role) => role === "ops" ? "operasional" : role === "dev" ? "developer" : role);
  return { userId: user.id, organizationWide: roles.includes("owner") || roles.includes("operasional") };
};

/** Service domain manajemen proyek, inisialisasi roster pembuat proyek, arsip versi PRD GZIP awal, dan nilai kontrak. */
export const projectsService = {
  /**
   * Mengambil daftar proyek berdasarkan filter pencarian/status dan mengonversi `contractValue` Decimal ke number.
   *
   * @param filters - Filter opsional status pipeline dan kata kunci pencarian.
   */
  async getAllProjects(filters: ProjectQueryFilter, user: AuthUserPayload) {
    return (await projectsRepository.findMany(filters, visibilityScope(user))).map((project) => ({ ...project, contractValue: Number(project.contractValue), owner: withResolvedUserAvatar(project.owner) }));
  },

  async getProjectPage(filters: ProjectListingQuery, user: AuthUserPayload) {
    const result = await projectsRepository.findPage(filters, visibilityScope(user));
    return {
      ...result,
      items: result.items.map((project) => ({ ...project, contractValue: Number(project.contractValue), owner: withResolvedUserAvatar(project.owner) })),
      page: filters.page,
      pageSize: filters.limit,
      totalPages: Math.ceil(result.total / filters.limit),
    };
  },

  /**
   * Mengambil detail proyek beserta relasi tasks, pembayaran terformat signed URL, dan nilai kontrak numerik.
   *
   * @throws {NotFoundError} Bila proyek tidak ditemukan.
   */
  async getProjectById(id: string) {
    const project = await projectsRepository.findById(id);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }
    return {
      ...project,
      contractValue: Number(project.contractValue),
      owner: withResolvedUserAvatar(project.owner),
      roster: project.roster?.map((member) => ({
        ...member,
        user: withResolvedUserAvatar(member.user),
      })),
      statusRequests: project.statusRequests?.map((request) => ({
        ...request,
        votes: request.votes?.map((vote) => ({
          ...vote,
          user: withResolvedUserAvatar(vote.user),
        })),
      })),
      payments: project.payments?.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
        proofUrl: payment.proofUrl ? cloudinaryStorage.deliveryUrl(payment.proofUrl) : payment.proofUrl,
      })),
    };
  },

  /**
   * Membuat proyek baru beserta keanggotaan roster awal pembuatnya dan arsip Versi #1 PRD terkompresi GZIP.
   *
   * @param dto - Data proyek baru (`name`, `clientName`, `clientContact`, opsional `contractValue`, `prdContent`).
   * @param user - Pengguna pembuat proyek.
   */
  async createProject(dto: CreateProjectDto, user?: AuthUserPayload) {
    const prdContent = dto.prdContent || generateDefaultPrdContent(dto.name, dto.clientName);

    // Buat snapshot Versi #1 PRD terkompresi GZIP (AC-B2-4)
    const compressedPrd = await gzipAsync(Buffer.from(prdContent, "utf-8"));
    const uint8Prd = new Uint8Array(
      compressedPrd.buffer,
      compressedPrd.byteOffset,
      compressedPrd.byteLength
    ) as Uint8Array<ArrayBuffer>;

    const project = await prisma.$transaction(async (tx) => {
      const created = await projectsRepository.create({ ...dto, prdContent, ownerId: user?.id }, tx);

      if (user?.id) {
        await tx.projectRoster.create({
          data: { projectId: created.id, userId: user.id, roleInProject: user.roles?.[0] || "owner" },
        });
      }

      await tx.prdVersion.create({
        data: {
          projectId: created.id,
          versionNumber: 1,
          compressedContent: uint8Prd,
          charCount: prdContent.length,
          description: "Versi Awal PRD",
          createdById: user?.id,
        },
      });

      await projectsRepository.logActivity({
        projectId: created.id,
        category: "project",
        action: "CREATE",
        description: `Proyek "${created.name}" berhasil dibuat.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          clientName: created.clientName,
          contractValue: Number(created.contractValue),
          status: created.status,
          repoType: created.repoType,
        },
      }, tx);

      return created;
    });

    return { ...project, contractValue: Number(project.contractValue), owner: withResolvedUserAvatar(project.owner) };
  },

  /** Memperbarui informasi proyek dan secara otomatis membuat arsip `PrdVersion` terkompresi GZIP bila `prdContent` berubah. */
  async updateProject(id: string, dto: UpdateProjectDto, user?: AuthUserPayload) {
    const existing = await projectsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }

    const prdChanged = dto.prdContent !== undefined && dto.prdContent !== existing.prdContent;
    const compressedPrd = prdChanged ? await gzipAsync(Buffer.from(dto.prdContent!, "utf-8")) : undefined;
    const uint8Prd = compressedPrd
      ? new Uint8Array(compressedPrd.buffer, compressedPrd.byteOffset, compressedPrd.byteLength) as Uint8Array<ArrayBuffer>
      : undefined;
    const otherChanges = Object.fromEntries(Object.entries(dto).filter(([key]) => key !== "prdContent"));

    const updated = await prisma.$transaction(async (tx) => {
      const result = await projectsRepository.update(id, dto, tx);
      let nextVersionNumber: number | undefined;
      if (prdChanged && uint8Prd) {
        const latest = await tx.prdVersion.findFirst({ where: { projectId: id }, orderBy: { versionNumber: "desc" } });
        nextVersionNumber = (latest?.versionNumber ?? 0) + 1;
        await tx.prdVersion.create({
          data: {
            projectId: id,
            versionNumber: nextVersionNumber,
            compressedContent: uint8Prd,
            charCount: dto.prdContent!.length,
            description: `Pembaruan PRD #${nextVersionNumber}`,
            createdById: user?.id,
          },
        });
        await projectsRepository.logActivity({
          projectId: id,
          category: "project",
          action: "PRD_UPDATE",
          description: `Dokumen PRD spesifikasi proyek diperbarui (Versi #${nextVersionNumber}).`,
          userId: user?.id,
          userName: user?.name,
          userRole: user?.roles?.[0],
          metadata: { versionNumber: nextVersionNumber, charCount: dto.prdContent!.length },
        }, tx);
      }
      if (Object.keys(otherChanges).length || !prdChanged) {
        await projectsRepository.logActivity({
          projectId: id,
          category: "project",
          action: "UPDATE",
          description: `Informasi proyek "${result.name}" diperbarui.`,
          userId: user?.id,
          userName: user?.name,
          userRole: user?.roles?.[0],
          metadata: otherChanges,
        }, tx);
      }
      return result;
    });

    return { ...updated, contractValue: Number(updated.contractValue), owner: withResolvedUserAvatar(updated.owner) };
  },

  /** Memperbarui nilai kontrak proyek (`contractValue`) secara khusus dan mencatat audit log perubahan keuangan. */
  async updateContractValue(id: string, contractValue: number, user?: AuthUserPayload) {
    const existing = await projectsRepository.findById(id);
    if (!existing) throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    const updated = await prisma.$transaction(async (tx) => {
      const result = await projectsRepository.updateContractValue(id, contractValue, tx);
      await projectsRepository.logActivity({
        projectId: id,
        category: "finance",
        action: "CONTRACT_VALUE_CHANGE",
        description: `Nilai kontrak proyek diperbarui.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { previousValue: Number(existing.contractValue), newValue: contractValue },
      }, tx);
      return result;
    });
    return { contractValue: Number(updated.contractValue) };
  },
};
