import { migratePaymentTermsAndPolicies } from "../src/features/finance/finance.terms.migration.js";

async function main() {
  console.log("Menjalankan audit & migrasi US-3 (PaymentTerm triggers + RBAC role_policies)...");
  const result = await migratePaymentTermsAndPolicies();
  console.log(
    `Selesai: totalTerms=${result.totalTerms}, backfilledTriggerDates=${result.backfilledTriggerDates}, backfilledReadyAt=${result.backfilledReadyAt}, syncedRoles=${result.syncedRoles.join(",") || "none"}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Gagal menjalankan migrasi US-3:", err);
  process.exit(1);
});
