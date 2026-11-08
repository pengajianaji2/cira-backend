import { prisma } from "../../config/db.config.js";

/**
 * BR-TASK-05 — Migrasi status task legacy:
 * - in_progress -> todo
 * - done -> done
 * - Nilai asing dilaporkan sebelum constraint
 * - Pertahankan Task, storyPoints, dan history.
 */
export async function migrateLegacyTaskStatuses(): Promise<{
  migratedCount: number;
  totalTasks: number;
}> {
  // Hitung jumlah task yang berstatus in_progress
  const inProgressTasks = await prisma.task.count({
    where: { status: "in_progress" },
  });

  if (inProgressTasks > 0) {
    await prisma.task.updateMany({
      where: { status: "in_progress" },
      data: { status: "todo" },
    });
  }

  const totalTasks = await prisma.task.count();

  return {
    migratedCount: inProgressTasks,
    totalTasks,
  };
}
