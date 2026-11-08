import { migrateLegacyTaskStatuses } from "../src/features/tasks/tasks.migration.js";

async function main() {
  console.log("Menjalankan migrasi status task legacy (BR-TASK-05)...");
  const result = await migrateLegacyTaskStatuses();
  console.log(
    `Migrasi selesai: ${result.migratedCount} task 'in_progress' berhasil dimigrasikan menjadi 'todo' dari total ${result.totalTasks} task.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Gagal menjalankan migrasi status task:", err);
  process.exit(1);
});
