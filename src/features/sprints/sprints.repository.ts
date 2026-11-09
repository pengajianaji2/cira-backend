import { prisma } from "../../config/db.config.js";
import { CreateSprintDto, TaskMoveTarget, UpdateSprintDto } from "./sprints.types.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { evaluateProjectTermReadinessInTx } from "../finance/finance.repository.js";

export const sprintsRepository = {
  async findProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
    });
  },

  async isUserInProjectRoster(projectId: string, userId: string): Promise<boolean> {
    const member = await prisma.projectRoster.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
      select: { id: true },
    });
    return Boolean(member);
  },

  async findSprintsByProjectId(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        tasks: {
          orderBy: [{ status: "asc" }, { order: "asc" }],
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.sprint.findUnique({
      where: { id },
      include: {
        project: true,
        tasks: {
          orderBy: [{ status: "asc" }, { order: "asc" }],
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  async findActiveSprintByProjectId(projectId: string) {
    return prisma.sprint.findFirst({
      where: {
        projectId,
        status: "active",
      },
      include: {
        tasks: true,
      },
    });
  },

  async create(projectId: string, data: CreateSprintDto) {
    return prisma.sprint.create({
      data: {
        projectId,
        name: data.name,
        goal: data.goal,
        status: "planning",
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: {
        tasks: true,
      },
    });
  },

  async update(id: string, data: UpdateSprintDto & { status?: string; completedAt?: Date | null }) {
    const updatePayload: any = { ...data };
    if (data.startDate !== undefined) {
      updatePayload.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.endDate !== undefined) {
      updatePayload.endDate = data.endDate ? new Date(data.endDate) : null;
    }

    return prisma.sprint.update({
      where: { id },
      data: updatePayload,
      include: {
        tasks: {
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * BR-SPRINT-02 — Aktivasi Sprint secara atomik dengan advisory lock
   * Memastikan maksimal 1 sprint aktif per proyek secara konkuren.
   */
  async startSprintAtomically(id: string, projectId: string, startDate: Date, endDate: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`sprint-start-${projectId}`}))`;
      const active = await tx.sprint.findFirst({ where: { projectId, status: "active" }, select: { id: true } });
      if (active && active.id !== id) return null;
      const changed = await tx.sprint.updateMany({
        where: { id, projectId, status: "planning" },
        data: { status: "active", startDate, endDate },
      });
      if (changed.count !== 1) return null;
      return tx.sprint.findUnique({ where: { id }, include: { tasks: true } });
    });
  },

  /**
   * BR-SPRINT-04, BR-SPRINT-05 & AC-3.2 — Penutupan Sprint Atomik
   * - Memindahkan seluruh task 'todo' ke Backlog atau sprint non-completed lain
   * - Mengubah status sprint menjadi completed & mengisi completedAt
   * - Menghitung ulang dan menyimpan progress proyek (BR-PROJECT-01)
   * - Mengevaluasi pemicu termin berbasis jumlah sprint selesai secara idempotent (AC-3.2)
   * - Mencatat activity log dalam transaksi tunggal
   */
  async completeSprintAtomically(
    id: string,
    projectId: string,
    taskMoves: TaskMoveTarget[],
    completedAt: Date,
    actor?: { id?: string; name?: string; role?: string }
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`sprint-close-${projectId}`}))`;

      // 1. Ambil sprint
      const sprint = await tx.sprint.findUnique({
        where: { id },
        include: { tasks: true },
      });

      if (!sprint || sprint.projectId !== projectId) {
        throw new NotFoundError(`Sprint dengan ID '${id}' tidak ditemukan pada proyek ini.`);
      }

      if (sprint.status !== "active") {
        throw new BadRequestError(`Hanya sprint aktif yang dapat diselesaikan. Status sprint saat ini: '${sprint.status}'.`);
      }

      // 2. Validasi task TODO wajib dialokasikan seluruhnya (BR-SPRINT-04)
      const todoTasks = sprint.tasks.filter((t) => t.status === "todo");
      for (const todoTask of todoTasks) {
        const move = taskMoves.find((m) => m.taskId === todoTask.id);
        if (!move) {
          throw new BadRequestError(
            `Task TODO "${todoTask.title}" belum ditentukan tujuannya (wajib dialokasikan ke Backlog atau Sprint lain).`
          );
        }

        if (move.targetSprintId) {
          const targetSprint = await tx.sprint.findUnique({
            where: { id: move.targetSprintId },
            select: { id: true, projectId: true, status: true, name: true },
          });

          if (!targetSprint || targetSprint.projectId !== projectId) {
            throw new BadRequestError("Sprint target pemindahan task harus berada dalam proyek yang sama.");
          }
          if (targetSprint.status === "completed") {
            throw new BadRequestError(`Sprint target "${targetSprint.name}" sudah berstatus completed dan tidak dapat menerima task.`);
          }

          await tx.task.update({
            where: { id: todoTask.id },
            data: { sprintId: move.targetSprintId },
          });
        } else {
          await tx.task.update({
            where: { id: todoTask.id },
            data: { sprintId: null },
          });
        }
      }

      // 3. Update status sprint menjadi completed (BR-SPRINT-06: completedAt diisi pada transisi pertama)
      const updatedSprint = await tx.sprint.update({
        where: { id },
        data: {
          status: "completed",
          completedAt,
        },
        include: {
          tasks: true,
        },
      });

      // 4. Hitung dan simpan progress proyek berbasis sprint (BR-PROJECT-01)
      const totalSprintCount = await tx.sprint.count({
        where: { projectId },
      });
      const completedSprintCount = await tx.sprint.count({
        where: { projectId, status: "completed" },
      });

      const progress =
        totalSprintCount === 0
          ? 0
          : Math.min(100, Math.round((completedSprintCount / totalSprintCount) * 1000) / 10);

      await tx.project.update({
        where: { id: projectId },
        data: { progress },
      });

      // 5. Evaluasi pemicu termin (sprint & tanggal jatuh tempo) secara atomik dan idempotent
      const readyTermIds = await evaluateProjectTermReadinessInTx(tx, projectId, completedAt, actor);

      // 6. Catat riwayat audit
      await tx.activityLog.create({
        data: {
          projectId,
          category: "project",
          action: "SPRINT_COMPLETE",
          description: `Sprint "${sprint.name}" diselesaikan. ${todoTasks.length} task TODO dialihkan. Progres proyek: ${progress}%.`,
          userId: actor?.id,
          userName: actor?.name,
          userRole: actor?.role,
          metadata: {
            sprintId: id,
            sprintName: sprint.name,
            completedAt,
            resolvedTodoTaskCount: todoTasks.length,
            progress,
            completedSprintCount,
            totalSprintCount,
            readyTermIds,
          },
        },
      });

      return {
        sprint: updatedSprint,
        progress,
        completedSprintCount,
        totalSprintCount,
        readyTermIds,
      };
    });
  },

  async delete(id: string) {
    return prisma.sprint.delete({
      where: { id },
    });
  },

  async findTasksByIds(taskIds: string[]) {
    return prisma.task.findMany({
      where: {
        id: { in: taskIds },
      },
    });
  },

  async assignTasksToSprint(sprintId: string, taskIds: string[], projectId: string) {
    return prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        projectId,
      },
      data: {
        sprintId,
      },
    });
  },

  async removeTaskFromSprint(taskId: string) {
    return prisma.task.update({
      where: { id: taskId },
      data: { sprintId: null },
    });
  },

  /**
   * BR-PROJECT-01 — Rumus progres proyek:
   * progress = completedSprintCount / totalSprintCount * 100%
   */
  async calculateCumulativeProgress(projectId: string): Promise<{
    totalScopePoints: number;
    completedPoints: number;
    progress: number;
    completedSprintCount: number;
    totalSprintCount: number;
  }> {
    const [totalSprintCount, completedSprintCount, scopedTasks] = await Promise.all([
      prisma.sprint.count({ where: { projectId } }),
      prisma.sprint.count({ where: { projectId, status: "completed" } }),
      prisma.task.findMany({
        where: { projectId, storyPoints: { not: null } },
        select: {
          storyPoints: true,
          status: true,
          sprint: { select: { status: true } },
        },
      }),
    ]);

    const totalScopePoints = scopedTasks.reduce(
      (sum, task) => sum + (task.storyPoints ?? 0),
      0
    );

    const completedTasks = scopedTasks.filter(
      (task) => task.sprint?.status === "completed" && task.status === "done"
    );

    const completedPoints = completedTasks.reduce(
      (sum, task) => sum + (task.storyPoints ?? 0),
      0
    );

    const progress =
      totalSprintCount === 0
        ? 0
        : Math.min(100, Math.round((completedSprintCount / totalSprintCount) * 1000) / 10);

    return {
      totalScopePoints,
      completedPoints,
      progress,
      completedSprintCount,
      totalSprintCount,
    };
  },

  async updateProjectProgress(projectId: string, progress: number) {
    return prisma.project.update({
      where: { id: projectId },
      data: { progress },
    });
  },

  async logActivity(data: {
    projectId: string;
    category: string;
    action: string;
    description: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    metadata?: any;
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
        metadata: data.metadata,
      },
    });
  },
};
