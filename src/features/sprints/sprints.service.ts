import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { sprintsRepository } from "./sprints.repository.js";
import {
  AssignTasksToSprintDto,
  CreateSprintDto,
  FIBONACCI_POINTS,
  ProjectCumulativeProgress,
  UpdateSprintDto,
} from "./sprints.types.js";

function isFibonacci(points: number | null | undefined): boolean {
  if (points === null || points === undefined) return false;
  return (FIBONACCI_POINTS as readonly number[]).includes(points);
}

export const sprintsService = {
  async getSprintsByProjectId(projectId: string) {
    const project = await sprintsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const sprints = await sprintsRepository.findSprintsByProjectId(projectId);

    return sprints.map((sprint) => {
      const totalTasks = sprint.tasks.length;
      const completedTasks = sprint.tasks.filter((t) => t.status === "done").length;
      const totalPoints = sprint.tasks.reduce(
        (sum, t) => sum + (t.storyPoints ?? 0),
        0
      );
      const completedPoints = sprint.tasks
        .filter((t) => t.status === "done")
        .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

      return {
        ...sprint,
        totalTasks,
        completedTasks,
        totalPoints,
        completedPoints,
      };
    });
  },

  async getSprintById(id: string) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    const totalTasks = sprint.tasks.length;
    const completedTasks = sprint.tasks.filter((t) => t.status === "done").length;
    const totalPoints = sprint.tasks.reduce(
      (sum, t) => sum + (t.storyPoints ?? 0),
      0
    );
    const completedPoints = sprint.tasks
      .filter((t) => t.status === "done")
      .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

    return {
      ...sprint,
      totalTasks,
      completedTasks,
      totalPoints,
      completedPoints,
    };
  },

  async createSprint(projectId: string, dto: CreateSprintDto, user?: AuthUserPayload) {
    const project = await sprintsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const sprint = await sprintsRepository.create(projectId, dto);

    await sprintsRepository.logActivity({
      projectId,
      category: "project",
      action: "SPRINT_CREATE",
      description: `Sprint "${sprint.name}" dibuat dengan status planning.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { sprintId: sprint.id, name: sprint.name },
    });

    return sprint;
  },

  async updateSprint(id: string, dto: UpdateSprintDto, user?: AuthUserPayload) {
    const existing = await sprintsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    const updated = await sprintsRepository.update(id, dto);

    await sprintsRepository.logActivity({
      projectId: existing.projectId,
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

  async startSprint(id: string, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status === "active") {
      throw new BadRequestError("Sprint ini sudah dalam status aktif.");
    }

    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint yang telah selesai tidak dapat dimulai kembali.");
    }

    // Aturan 1: Hanya 1 sprint aktif per proyek pada satu waktu
    const activeSprint = await sprintsRepository.findActiveSprintByProjectId(sprint.projectId);
    if (activeSprint && activeSprint.id !== id) {
      throw new BadRequestError(
        `Hanya boleh tepat satu sprint aktif dalam proyek. Sprint "${activeSprint.name}" saat ini masih berjalan.`
      );
    }

    // Aturan 2: AC-10 (AC-B3-1) - Task dalam sprint wajib memiliki tepat satu assignee dan points Fibonacci
    if (sprint.tasks.length === 0) {
      throw new BadRequestError("Sprint belum memiliki task. Tambahkan minimal 1 task sebelum memulai sprint.");
    }

    for (const task of sprint.tasks) {
      if (!task.assigneeId) {
        throw new BadRequestError(
          `Task "${task.title}" belum memiliki assignee. Seluruh task dalam sprint wajib memiliki tepat satu assignee sebelum sprint dimulai.`
        );
      }
      if (!isFibonacci(task.storyPoints)) {
        throw new BadRequestError(
          `Task "${task.title}" belum memiliki story points Fibonacci yang valid (1, 2, 3, 5, 8, 13).`
        );
      }
    }

    const updated = await sprintsRepository.startSprintAtomically(
      id,
      sprint.projectId,
      sprint.startDate ?? new Date(),
    );
    if (!updated) throw new BadRequestError("Sprint lain sudah dimulai atau status sprint berubah. Muat ulang data.");

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_START",
      description: `Sprint "${sprint.name}" telah dimulai (status aktif).`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: { sprintId: id, taskCount: sprint.tasks.length },
    });

    return updated;
  },

  async completeSprint(id: string, user?: AuthUserPayload) {
    const sprint = await sprintsRepository.findById(id);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan.`);
    }

    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint sudah berstatus selesai.");
    }

    // AC-11 (AC-B3-2): Penolakan jika ada task yang belum berstatus 'done'
    const incompleteTasks = sprint.tasks.filter((t) => t.status !== "done");
    if (incompleteTasks.length > 0) {
      throw new BadRequestError(
        `Tidak dapat menyelesaikan sprint: masih terdapat ${incompleteTasks.length} task yang belum berstatus 'done'.`
      );
    }

    // Perbarui status sprint menjadi completed
    const completedAt = new Date();
    const updated = await sprintsRepository.update(id, {
      status: "completed",
      completedAt,
    });

    // AC-12 (AC-B3-3): Kalkulasi ulang progres kumulatif proyek
    const cumulative = await sprintsRepository.calculateCumulativeProgress(sprint.projectId);
    await sprintsRepository.updateProjectProgress(sprint.projectId, cumulative.progress);

    await sprintsRepository.logActivity({
      projectId: sprint.projectId,
      category: "project",
      action: "SPRINT_COMPLETE",
      description: `Sprint "${sprint.name}" diselesaikan. Progres proyek kini ${cumulative.progress}%.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        sprintId: id,
        cumulativeProgress: cumulative.progress,
        completedPoints: cumulative.completedPoints,
        totalScopePoints: cumulative.totalScopePoints,
      },
    });

    return {
      sprint: updated,
      cumulativeProgress: cumulative,
    };
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

    // AC-12 (AC-B3-3): Rekalkulasi progres kumulatif setelah sprint dibuka kembali
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
        cumulativeProgress: cumulative.progress,
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

    const wasCompleted = sprint.status === "completed";
    await sprintsRepository.delete(id);

    // Jika sprint yang dihapus berstatus completed, rekalkulasi progres
    let cumulative = null;
    if (wasCompleted) {
      cumulative = await sprintsRepository.calculateCumulativeProgress(sprint.projectId);
      await sprintsRepository.updateProjectProgress(sprint.projectId, cumulative.progress);
    }

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

    const tasks = await sprintsRepository.findTasksByIds(dto.taskIds);
    if (tasks.length !== dto.taskIds.length) {
      throw new NotFoundError("Beberapa task yang dipilih tidak ditemukan.");
    }
    if (tasks.some((task) => task.projectId !== sprint.projectId)) {
      throw new BadRequestError("Semua task harus berasal dari proyek yang sama dengan sprint.");
    }

    // Jika sprint aktif, validasi bahwa task yang dimasukkan sudah memiliki assignee dan valid story points
    if (sprint.status === "active") {
      for (const t of tasks) {
        if (!t.assigneeId) {
          throw new BadRequestError(
            `Task "${t.title}" belum memiliki assignee. Task yang dimasukkan ke sprint aktif wajib memiliki assignee.`
          );
        }
        if (!isFibonacci(t.storyPoints)) {
          throw new BadRequestError(
            `Task "${t.title}" belum memiliki story points Fibonacci (1, 2, 3, 5, 8, 13).`
          );
        }
      }
    }

    await sprintsRepository.assignTasksToSprint(sprintId, dto.taskIds, sprint.projectId);

    // Rekalkulasi progres proyek jika sprint berstatus completed
    if (sprint.status === "completed") {
      const cumulative = await sprintsRepository.calculateCumulativeProgress(sprint.projectId);
      await sprintsRepository.updateProjectProgress(sprint.projectId, cumulative.progress);
    }

    return { success: true, count: dto.taskIds.length };
  },

  async removeTask(taskId: string, user?: AuthUserPayload) {
    const updated = await sprintsRepository.removeTaskFromSprint(taskId);

    // Rekalkulasi progres proyek jika task sebelumnya di sprint completed
    const cumulative = await sprintsRepository.calculateCumulativeProgress(updated.projectId);
    await sprintsRepository.updateProjectProgress(updated.projectId, cumulative.progress);

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
