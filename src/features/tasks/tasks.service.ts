import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { sprintsRepository } from "../sprints/sprints.repository.js";
import { tasksRepository } from "./tasks.repository.js";
import { withResolvedUserAvatar } from "../files/fileSecurity.js";
import {
  CreateTaskDto,
  MoveTaskToSprintDto,
  ProjectTasksResult,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from "./tasks.types.js";

function serializeTask<T extends { assignee?: any }>(task: T): any {
  return {
    ...task,
    assignee: withResolvedUserAvatar(task.assignee),
  };
}

export const tasksService = {
  /**
   * Mengambil seluruh Todo proyek beserta status keterpenuhan DP untuk peringatan visual (`dpWarning`).
   *
   * @param projectId - ID proyek target.
   * @throws {NotFoundError} Bila proyek tidak ditemukan.
   */
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
      tasks: tasks.map(serializeTask),
      hasVerifiedDp,
      dpWarning: !hasVerifiedDp,
    };
  },

  /**
   * BR-TASK-01 — Status tunggal ('todo' | 'done'). Default 'todo'.
   * BR-TASK-02 — Setiap task harus langsung berada dalam satu Sprint.
   * BR-TASK-04 — Sprint harus dalam proyek yang sama dan tidak boleh completed.
   */
  async createTask(projectId: string, dto: CreateTaskDto, user?: AuthUserPayload) {
    const project = await tasksRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const sprintId = dto.sprintId;

    if (dto.assigneeId && !(await sprintsRepository.isUserInProjectRoster(projectId, dto.assigneeId))) {
      throw new BadRequestError("PIC task harus berasal dari roster proyek.");
    }

    const sprint = await sprintsRepository.findById(sprintId);
    if (!sprint) {
      throw new NotFoundError(`Sprint dengan ID '${sprintId}' tidak ditemukan.`);
    }
    if (sprint.projectId !== projectId) {
      throw new BadRequestError("Sprint harus berasal dari proyek yang sama dengan task.");
    }
    if (sprint.status === "completed") {
      throw new BadRequestError("Sprint yang sudah selesai (completed) tidak dapat menerima task baru.");
    }

    const status = dto.status || "todo";
    let order = dto.order;
    if (order === undefined) {
      order = await tasksRepository.getNextOrder(projectId, status);
    }

    return tasksRepository.transaction(async (tx) => {
      const task = await tasksRepository.create(projectId, {
        ...dto,
        status,
        sprintId,
        order,
      }, tx);

      await tasksRepository.logActivity({
        projectId,
        category: "task",
        action: "CREATE",
        description: `Task "${task.title}" dibuat di Sprint "${task.sprint?.name ?? sprintId}" dengan status ${task.status}.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          taskId: task.id,
          status: task.status,
          priority: task.priority,
          sprintId: task.sprintId,
        },
      }, tx);

      return serializeTask(task);
    });
  },

  /**
   * BR-TASK-01 — Status tunggal ('todo' | 'done'). Checkbox checked iff 'done'.
   * Tidak ada 'isCompleted' paralel.
   */
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

    return tasksRepository.transaction(async (tx) => {
      const updated = await tasksRepository.update(id, { status: dto.status, order }, tx);
      await tasksRepository.logActivity({
        projectId: existing.projectId,
        category: "task",
        action: "STATUS_CHANGE",
        description: `Status task "${existing.title}" diubah dari "${existing.status}" menjadi "${dto.status}".`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { taskId: id, previousStatus: existing.status, newStatus: dto.status, order },
      }, tx);
      return serializeTask(updated);
    });
  },

  /**
   * BR-TASK-03 & BR-TASK-04 — Pemindahan task antar sprint.
   * - Memeriksa proyek sama
   * - Sprint target valid dan tidak completed
   */
  async moveTaskToSprint(
    id: string,
    dto: MoveTaskToSprintDto,
    user?: AuthUserPayload
  ) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    const { targetSprintId } = dto;

    const targetSprint = await sprintsRepository.findById(targetSprintId);
    if (!targetSprint) {
      throw new NotFoundError(`Sprint target dengan ID '${targetSprintId}' tidak ditemukan.`);
    }

    if (targetSprint.projectId !== existing.projectId) {
      throw new BadRequestError("Sprint harus berasal dari proyek yang sama dengan task.");
    }

    if (targetSprint.status === "completed") {
      throw new BadRequestError("Sprint yang sudah selesai (completed) tidak dapat menerima task baru.");
    }

    return tasksRepository.transaction(async (tx) => {
      const updated = await tasksRepository.update(id, { sprintId: targetSprintId }, tx);
      await tasksRepository.logActivity({
        projectId: existing.projectId,
        category: "task",
        action: "MOVE_TO_SPRINT",
        description: `Task "${existing.title}" dipindahkan ke sprint "${targetSprint.name}".`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: {
          taskId: id,
          previousSprintId: existing.sprintId,
          newSprintId: targetSprintId,
          targetSprintStatus: targetSprint.status,
        },
      }, tx);
      return serializeTask(updated);
    });
  },

  /**
   * Memperbarui detail task termasuk pemindahan `sprintId` bila disertakan.
   *
   * @param id - ID task target.
   * @param dto - Field task yang diperbarui.
   * @param user - Identitas pengguna pelaku mutasi untuk log aktivitas.
   * @throws {NotFoundError} Bila task tidak ditemukan.
   * @throws {BadRequestError} Bila sprint tujuan tidak valid, berbeda proyek, atau berstatus `completed`.
   */
  async updateTask(id: string, dto: UpdateTaskDto, user?: AuthUserPayload) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    if (dto.assigneeId && !(await sprintsRepository.isUserInProjectRoster(existing.projectId, dto.assigneeId))) {
      throw new BadRequestError("PIC task harus berasal dari roster proyek.");
    }

    // Jika sprintId diubah
    if (dto.sprintId !== undefined) {
      const sprint = await sprintsRepository.findById(dto.sprintId);
      if (!sprint || sprint.projectId !== existing.projectId) {
        throw new BadRequestError("Sprint harus berasal dari proyek yang sama dengan task.");
      }
      if (sprint.status === "completed") {
        throw new BadRequestError("Sprint yang sudah selesai (completed) tidak dapat menerima task baru.");
      }
    }

    const isStatusChanged = dto.status && dto.status !== existing.status;
    return tasksRepository.transaction(async (tx) => {
      const updated = await tasksRepository.update(id, dto, tx);
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
          changes: Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
        },
      }, tx);
      return serializeTask(updated);
    });
  },

  /**
   * Menghapus task secara permanen dan mencatat riwayat penghapusan ke log aktivitas proyek.
   *
   * @param id - ID task yang dihapus.
   * @param user - Identitas pengguna pelaku penghapusan.
   * @returns Snapshot task sebelum dihapus.
   * @throws {NotFoundError} Bila task tidak ditemukan.
   */
  async deleteTask(id: string, user?: AuthUserPayload) {
    const existing = await tasksRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Task dengan ID '${id}' tidak ditemukan.`);
    }

    return tasksRepository.transaction(async (tx) => {
      await tasksRepository.delete(id, tx);
      await tasksRepository.logActivity({
        projectId: existing.projectId,
        category: "task",
        action: "DELETE",
        description: `Task "${existing.title}" dihapus.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { taskId: id, title: existing.title },
      }, tx);
      return serializeTask(existing);
    });
  },
};
