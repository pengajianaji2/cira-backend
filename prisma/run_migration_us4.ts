import { migrateOperationsPolicies } from "../src/features/operations/operations.migration.js";

async function main() {
  console.log("Menjalankan sinkronisasi RBAC role_policies US-4 (Kalender Operasional)...");
  const result = await migrateOperationsPolicies();
  console.log(`Selesai: syncedRoles=${result.syncedRoles.join(", ") || "none (sudah sinkron)"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Gagal menjalankan migrasi US-4:", err);
  process.exit(1);
});
