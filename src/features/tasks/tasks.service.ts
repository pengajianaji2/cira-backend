import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { sprintsRepository } from "../sprints/sprints.repository.js";
import { FIBONACCI_POINTS } from "../sprints/sprints.types.js";
import { tasksRepository } from "./tasks.repository.js";
import {
  CreateTaskDto,
  ProjectTasksResult,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from "./tasks.types.js";

function isFibonacci(points: number | null | undefined): boolean {
  if (points === null || points === undefined) return false;
  return (FIBONACCI_POINTS as readonly number[]).includes(points);
}

export const tasksService = {
  async getTasksByProjectId(projectId: string): Promise<ProjectTasksResult> {
    const project = await tasksRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const [tasks, hasVerifiedDp] = await Promise.all([
      tasksRepository.findTasksByProjectId(projectId),
      tasksRepository.checkProjectDpStatus(projectId),
    ]);

    return {
      tasks,
      hasVerifiedDp,
      dpWarning: !hasVerifiedDp,
    };
  },

  async createTask(projectId: string, dto: CreateTaskDto, user?: AuthUserPayload) {
    const project = await tasksRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    // Jika task langsung dimasukkan ke sprint
    if (dto.sprintId) {
      const sprint = await sprintsRepository.findById(dto.sprintId);
      if (!sprint) {
        throw new NotFoundError(`Sprint dengan ID '${dto.sprintId}' tidak ditemukan.`);
      }

      // Jika sprint berstatus aktif, wajib memiliki assignee dan Fibonacci points
      if (sprint.status === "active") {
        if (!dto.assigneeId) {
          throw new BadRequestError(
            "Task yang dimasukkan ke sprint aktif wajib memiliki tepat satu assignee."
          );
        }
        if (!isFibonacci(dto.storyPoints)) {
          throw new BadRequestError(
            "Task yang dimasukkan ke sprint aktif wajib memiliki story points Fibonacci (1, 2, 3, 5, 8, 13)."
          );
        }
      }
    }

    let order = dto.order;
    if (order === undefined) {
      order = await tasksRepository.getNextOrder(projectId, dto.status || "todo");
    }

    const task = await tasksRepository.create(projectId, {
      ...dto,
      order,
    });

    await tasksRepository.logActivity({
      projectId,
      category: "task",
      action: "CREATE",
      description: `Task "${task.title}" dibuat di kolom ${task.status}.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        taskId: task.id,
        status: task.status,
        priority: task.priority,
        storyPoints: task.storyPoints,
        sprintId: task.sprintId,
      },
    });

    // Perbarui progres kumulatif proyek jika task memiliki poin
    if (task.storyPoints) {
      const cumulative = await sprintsRepository.calculateCumulativeProgress(projectId);
      await sprintsRepository.updateProjectProgress(projectId, cumulative.progress);
    }

    return task;
  },

  async updateTaskStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    user?: AuthUserPayload
  ) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    let order = dto.order;
    if (order === undefined && dto.status !== existing.status) {
      order = await tasksRepository.getNextOrder(existing.projectId, dto.status);
    }

    const updated = await tasksRepository.update(id, {
      status: dto.status,
      order,
    });

    await tasksRepository.logActivity({
      projectId: existing.projectId,
      category: "task",
      action: "STATUS_CHANGE",
      description: `Status task "${existing.title}" diubah dari "${existing.status}" menjadi "${dto.status}".`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        taskId: id,
        previousStatus: existing.status,
        newStatus: dto.status,
        order,
      },
    });

    // Rekalkulasi progres proyek jika status berubah
    const cumulative = await sprintsRepository.calculateCumulativeProgress(existing.projectId);
    await sprintsRepository.updateProjectProgress(existing.projectId, cumulative.progress);

    return updated;
  },

  async updateTask(id: string, dto: UpdateTaskDto, user?: AuthUserPayload) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    // Jika sprintId diubah ke sprint aktif
    const targetSprintId = dto.sprintId !== undefined ? dto.sprintId : existing.sprintId;
    if (targetSprintId) {
      const sprint = await sprintsRepository.findById(targetSprintId);
      if (sprint && sprint.status === "active") {
        const finalAssigneeId = dto.assigneeId !== undefined ? dto.assigneeId : existing.assigneeId;
        const finalPoints = dto.storyPoints !== undefined ? dto.storyPoints : existing.storyPoints;

        if (!finalAssigneeId) {
          throw new BadRequestError(
            "Task dalam sprint aktif wajib memiliki tepat satu assignee."
          );
        }
        if (!isFibonacci(finalPoints)) {
          throw new BadRequestError(
            "Task dalam sprint aktif wajib memiliki story points Fibonacci (1, 2, 3, 5, 8, 13)."
          );
        }
      }
    }

    const updated = await tasksRepository.update(id, dto);

    const isStatusChanged = dto.status && dto.status !== existing.status;

    await tasksRepository.logActivity({
      projectId: existing.projectId,
      category: "task",
      action: isStatusChanged ? "STATUS_CHANGE" : "UPDATE",
      description: isStatusChanged
        ? `Status task "${existing.title}" diubah menjadi "${dto.status}".`
        : `Task "${updated.title}" diperbarui.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        taskId: id,
        changes: dto,
      },
    });

    // Rekalkulasi progres kumulatif proyek
    const cumulative = await sprintsRepository.calculateCumulativeProgress(existing.projectId);
    await sprintsRepository.updateProjectProgress(existing.projectId, cumulative.progress);

    return updated;
  },

  async deleteTask(id: string, user?: AuthUserPayload) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    await tasksRepository.delete(id);

    await tasksRepository.logActivity({
      projectId: existing.projectId,
      category: "task",
      action: "DELETE",
      description: `Task "${existing.title}" dihapus.`,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
      metadata: {
        taskId: id,
        title: existing.title,
      },
    });

    // Rekalkulasi progres kumulatif proyek
    const cumulative = await sprintsRepository.calculateCumulativeProgress(existing.projectId);
    await sprintsRepository.updateProjectProgress(existing.projectId, cumulative.progress);

    return existing;
  },
};
