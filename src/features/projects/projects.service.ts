import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { projectsRepository } from "./projects.repository.js";
import { CreateProjectDto, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";
import { cloudinaryStorage } from "../assets/cloudinary.service.js";

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

export const projectsService = {
  async getAllProjects(filters: ProjectQueryFilter) {
    return projectsRepository.findMany(filters);
  },

  async getProjectById(id: string) {
    const project = await projectsRepository.findById(id);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }
    return {
      ...project,
      payments: project.payments?.map((payment) => ({
        ...payment,
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
        contractValue: project.contractValue,
        status: project.status,
      },
    });

    return project;
  },

  async updateProject(id: string, dto: UpdateProjectDto, user?: AuthUserPayload) {
    const existing = await projectsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    }

    const updated = await projectsRepository.update(id, dto);

    // Audit Log berdasarkan jenis perubahan
    if (dto.status && dto.status !== existing.status) {
      await projectsRepository.logActivity({
        projectId: id,
        category: "project",
        action: "STATUS_CHANGE",
        description: `Status proyek diubah dari "${existing.status}" menjadi "${dto.status}".`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          previousStatus: existing.status,
          newStatus: dto.status,
        },
      });
    } else if (dto.prdContent && dto.prdContent !== existing.prdContent) {
      await projectsRepository.logActivity({
        projectId: id,
        category: "project",
        action: "PRD_UPDATE",
        description: "Dokumen PRD spesifikasi proyek berhasil diperbarui.",
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
      });
    } else {
      await projectsRepository.logActivity({
        projectId: id,
        category: "project",
        action: "UPDATE",
        description: `Informasi proyek "${updated.name}" diperbarui.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: dto,
      });
    }

    return updated;
  },
};
