import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { sprintsRepository } from "./sprints.repository.js";
import {
  AssignTasksToSprintDto,
  CloseSprintDto,
  CreateSprintDto,
  FIBONACCI_POINTS,
  ProjectCumulativeProgress,
  SprintSummary,
  StartSprintDto,
  UpdateSprintDto,
} from "./sprints.types.js";

function isFibonacci(points: number | null | undefined): boolean {
  if (points === null || points === undefined) return false;
  return (FIBONACCI_POINTS as readonly number[]).includes(points);
}

export const sprintsService = {
  async getSprintsByProjectId(projectId: string): Promise<SprintSummary[]> {
    const project = await sprintsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const sprints = await sprintsRepository.findSprintsByProjectId(projectId);

    return sprints.map((sprint) => {
      const totalPoints = sprint.tasks.reduce(
        (sum, task) => sum + (task.storyPoints ?? 0),
        0
      );
      const completedPoints = sprint.tasks
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);

      const totalTasks = sprint.tasks.length;
      const completedTasks = sprint.tasks.filter((task) => task.status === "done").length;

      return {
        id: sprint.id,
        projectId: sprint.projectId,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status as any,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        completedAt: sprint.completedAt,
        totalPoints,
        completedPoints,
        totalTasks,
        completedTasks,
        createdAt: sprint.createdAt,
        updatedAt: sprint.updatedAt,
      };
    });
  },

  async getSprintById(id: string) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }
    return sprint;
  },

  /**
   * BR-SPRINT-01 — Planning. Tanggal boleh kosong.
   * Jika start/end keduanya ada, pastikan start <= end.
   */
  async createSprint(projectId: string, dto: CreateSprintDto, user?: AuthUserPayload) {
    const project = await sprintsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    if (dto.startDate && dto.endDate) {
      if (new Date(dto.startDate) > new Date(dto.endDate)) {
        throw new BadRequestError("Tanggal mulai sprint tidak boleh melebihi tanggal selesai.");
      }
    }

    const sprint = await sprintsRepository.create(projectId, dto);

    // BR-PROJECT-01: Penambahan sprint baru dapat mengubah denominator progres proyek
    const progressData = await sprintsRepository.calculateCumulativeProgress(projectId);
    await sprintsRepository.updateProjectProgress(projectId, progressData.progress);

    await sprintsRepository.logActivity({
      projectId,
      category: "project",
      action: "SPRINT_CREATE",
      description: `Sprint "${sprint.name}" dibuat dalam status planning.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        sprintId: sprint.id,
        name: sprint.name,
        status: sprint.status,
      },
    });

    return sprint;
  },

  /**
   * BR-SPRINT-02 — Aktivasi Sprint.
   * - Wajib memiliki startDate dan endDate valid
   * - startDate <= endDate
   * - Proyek sesuai & maksimal satu sprint active per proyek.
   */
  async startSprint(id: string, dto: StartSprintDto, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status === "active") {
      throw new BadRequestError("Sprint ini sudah dalam status aktif.");
    }

    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint yang telah selesai tidak dapat diaktifkan kembali.");
    }

    // Validasi kelengkapan tanggal aktivasi (BR-SPRINT-02)
    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestError("Tanggal mulai dan tanggal selesai wajib diisi untuk mengaktifkan sprint.");
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestError("Format tanggal mulai atau tanggal selesai tidak valid.");
    }

    if (start > end) {
      throw new BadRequestError("Tanggal mulai tidak boleh melebihi tanggal selesai.");
    }

    // Aturan 1 Sprint Aktif per Proyek (BR-SPRINT-02)
    const activeSprint = await sprintsRepository.findActiveSprintByProjectId(sprint.projectId);
    if (activeSprint && activeSprint.id !== id) {
      throw new BadRequestError(
        `Hanya boleh tepat satu sprint aktif dalam proyek. Sprint "${activeSprint.name}" saat ini masih berjalan.`
      );
    }

    const updated = await sprintsRepository.startSprintAtomically(
      id,
      sprint.projectId,
      start,
      end
    );

    if (!updated) {
      throw new BadRequestError("Gagal mengaktifkan sprint: sprint lain mungkin telah dimulai secara bersamaan. Silakan muat ulang data.");
    }

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_START",
      description: `Sprint "${sprint.name}" telah diaktifkan (${dto.startDate} s.d. ${dto.endDate}).`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        sprintId: id,
        startDate: dto.startDate,
        endDate: dto.endDate,
        taskCount: sprint.tasks.length,
      },
    });

    return updated;
  },

  /**
   * BR-SPRINT-03, BR-SPRINT-04, BR-SPRINT-05 & BR-PROJECT-01
   * Penutupan Sprint Manual & Atomik:
   * - End date tidak menutup otomatis
   * - Setiap task TODO wajib memiliki tujuan (Backlog sprintId=null atau sprint non-completed lain)
   * - Transaksi atomik Prisma: pindahkan task, ubah status completed, isi completedAt, hitung progress completed/total
   */
  async completeSprint(id: string, dto: CloseSprintDto, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status !== "active") {
      throw new BadRequestError(`Hanya sprint berstatus aktif yang dapat diselesaikan. Status saat ini: '${sprint.status}'.`);
    }

    const result = await sprintsRepository.completeSprintAtomically(
      id,
      sprint.projectId,
      dto.taskMoves || [],
      new Date(),
      {
        id: user?.id,
        name: user?.name,
        role: user?.roles?.[0],
      }
    );

    return result;
  },

  async updateSprint(id: string, dto: UpdateSprintDto, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint yang telah selesai tidak dapat diubah melalui pembaruan umum.");
    }

    const finalStart = dto.startDate !== undefined ? dto.startDate : sprint.startDate?.toISOString();
    const finalEnd = dto.endDate !== undefined ? dto.endDate : sprint.endDate?.toISOString();

    if (finalStart && finalEnd) {
      if (new Date(finalStart) > new Date(finalEnd)) {
        throw new BadRequestError("Tanggal mulai sprint tidak boleh melebihi tanggal selesai.");
      }
    }

    const updated = await sprintsRepository.update(id, dto);

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_UPDATE",
      description: `Sprint "${updated.name}" diperbarui.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { sprintId: id, changes: dto },
    });

    return updated;
  },

  async reopenSprint(id: string, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status !== "completed") {
      throw new BadRequestError("Hanya sprint yang telah selesai yang dapat dibuka kembali.");
    }

    // Kembalikan ke status planning agar tidak bentrok dengan sprint aktif yang mungkin ada
    const updated = await sprintsRepository.update(id, {
      status: "planning",
      completedAt: null,
    });

    // BR-PROJECT-01: Rekalkulasi progres proyek berbasis rumus sprint
    const cumulative = await sprintsRepository.calculateCumulativeProgress(sprint.projectId);
    await sprintsRepository.updateProjectProgress(sprint.projectId, cumulative.progress);

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_REOPEN",
      description: `Sprint "${sprint.name}" dibuka kembali (status: planning). Progres proyek kini ${cumulative.progress}%.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        sprintId: id,
        progress: cumulative.progress,
      },
    });

    return {
      sprint: updated,
      cumulativeProgress: cumulative,
    };
  },

  async deleteSprint(id: string, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    await sprintsRepository.delete(id);

    // Rekalkulasi progres proyek (denominator berkurang)
    const cumulative = await sprintsRepository.calculateCumulativeProgress(sprint.projectId);
    await sprintsRepository.updateProjectProgress(sprint.projectId, cumulative.progress);

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_DELETE",
      description: `Sprint "${sprint.name}" dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { sprintId: id, name: sprint.name },
    });

    return { success: true, cumulativeProgress: cumulative };
  },

  async assignTasks(sprintId: string, dto: AssignTasksToSprintDto, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(sprintId);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${sprintId}' tidak ditemukan.`);
    }

    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint yang sudah selesai tidak dapat menerima task baru.");
    }

    const tasks = await sprintsRepository.findTasksByIds(dto.taskIds);
    if (tasks.length !== dto.taskIds.length) {
      throw new NotFoundError("Beberapa task yang dipilih tidak ditemukan.");
    }
    if (tasks.some((task) => task.projectId !== sprint.projectId)) {
      throw new BadRequestError("Semua task harus berasal dari proyek yang sama dengan sprint.");
    }

    await sprintsRepository.assignTasksToSprint(sprintId, dto.taskIds, sprint.projectId);

    return { success: true, count: dto.taskIds.length };
  },

  async removeTask(taskId: string, user?: AuthUserPayload) {
    const updated = await sprintsRepository.removeTaskFromSprint(taskId);
    return updated;
  },

  async getProjectCumulativeProgress(projectId: string): Promise<ProjectCumulativeProgress> {
    const project = await sprintsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const cumulative = await sprintsRepository.calculateCumulativeProgress(projectId);
    return {
      projectId,
      ...cumulative,
    };
  },

  async recalculateProjectProgress(projectId: string): Promise<number> {
    const cumulative = await sprintsRepository.calculateCumulativeProgress(projectId);
    await sprintsRepository.updateProjectProgress(projectId, cumulative.progress);
    return cumulative.progress;
  },
};
