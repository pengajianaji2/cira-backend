import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { projectsRepository } from "./projects.repository.js";
import { CreateProjectDto, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";
import { cloudinaryStorage } from "../assets/cloudinary.service.js";
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

export const projectsService = {
  async getAllProjects(filters: ProjectQueryFilter) {
    return (await projectsRepository.findMany(filters)).map((project) => ({ ...project, contractValue: Number(project.contractValue) }));
  },

  async getProjectById(id: string) {
    const project = await projectsRepository.findById(id);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }
    return {
      ...project,
      contractValue: Number(project.contractValue),
      payments: project.payments?.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
        proofUrl: payment.proofUrl ? cloudinaryStorage.deliveryUrl(payment.proofUrl) : payment.proofUrl,
      })),
    };
  },

  async createProject(dto: CreateProjectDto, user?: AuthUserPayload) {
    const prdContent = dto.prdContent || generateDefaultPrdContent(dto.name, dto.clientName);

    const project = await projectsRepository.create({
      ...dto,
      prdContent,
      ownerId: user?.id,
    });

    // Otomatis daftarkan pembuat proyek ke ProjectRoster (US-2)
    if (user?.id) {
      await prisma.projectRoster.create({
        data: {
          projectId: project.id,
          userId: user.id,
          roleInProject: user.roles?.[0] || "owner",
        },
      });
    }

    // Buat snapshot Versi #1 PRD terkompresi GZIP (AC-B2-4)
    const compressedPrd = await gzipAsync(Buffer.from(prdContent, "utf-8"));
    const uint8Prd = new Uint8Array(
      compressedPrd.buffer,
      compressedPrd.byteOffset,
      compressedPrd.byteLength
    ) as Uint8Array<ArrayBuffer>;

    await prisma.prdVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        compressedContent: uint8Prd,
        charCount: prdContent.length,
        description: "Versi Awal PRD",
        createdById: user?.id,
      },
    });

    await projectsRepository.logActivity({
      projectId: project.id,
      category: "project",
      action: "CREATE",
      description: `Proyek "${project.name}" berhasil dibuat.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        clientName: project.clientName,
        contractValue: Number(project.contractValue),
        status: project.status,
        repoType: project.repoType,
      },
    });

    return { ...project, contractValue: Number(project.contractValue) };
  },

  async updateProject(id: string, dto: UpdateProjectDto, user?: AuthUserPayload) {
    const existing = await projectsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }

    const updated = await projectsRepository.update(id, dto);

    let loggedPrdChange = false;
    if (dto.prdContent !== undefined && dto.prdContent !== existing.prdContent) {
      // Simpan riwayat versi PRD terkompresi GZIP jika ada perubahan teks PRD
      const latest = await prisma.prdVersion.findFirst({
        where: { projectId: id },
        orderBy: { versionNumber: "desc" },
      });
      const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;
      const compressedPrd = await gzipAsync(Buffer.from(dto.prdContent, "utf-8"));
      const uint8Prd = new Uint8Array(
        compressedPrd.buffer,
        compressedPrd.byteOffset,
        compressedPrd.byteLength
      ) as Uint8Array<ArrayBuffer>;

      await prisma.prdVersion.create({
        data: {
          projectId: id,
          versionNumber: nextVersionNumber,
          compressedContent: uint8Prd,
          charCount: dto.prdContent.length,
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
        metadata: {
          versionNumber: nextVersionNumber,
          charCount: dto.prdContent.length,
        },
      });
      loggedPrdChange = true;
    }
    const otherChanges = Object.fromEntries(Object.entries(dto).filter(([key]) => key !== "prdContent"));
    if (Object.keys(otherChanges).length || !loggedPrdChange) {
      await projectsRepository.logActivity({
        projectId: id,
        category: "project",
        action: "UPDATE",
        description: `Informasi proyek "${updated.name}" diperbarui.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: otherChanges,
      });
    }

    return { ...updated, contractValue: Number(updated.contractValue) };
  },

  async updateContractValue(id: string, contractValue: number, user?: AuthUserPayload) {
    const existing = await projectsRepository.findById(id);
    if (!existing) throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    const updated = await projectsRepository.updateContractValue(id, contractValue);
    await projectsRepository.logActivity({
      projectId: id,
      category: "finance",
      action: "CONTRACT_VALUE_CHANGE",
      description: `Nilai kontrak proyek diperbarui.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { previousValue: Number(existing.contractValue), newValue: contractValue },
    });
    return { contractValue: Number(updated.contractValue) };
  },
};
