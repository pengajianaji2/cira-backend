import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { tasksRepository } from "./tasks.repository.js";
import {
  CreateTaskDto,
  ProjectTasksResult,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from "./tasks.types.js";

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
      },
    });

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

    return updated;
  },

  async updateTask(id: string, dto: UpdateTaskDto, user?: AuthUserPayload) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
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

    return existing;
  },
};
