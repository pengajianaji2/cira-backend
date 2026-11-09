import { prisma } from "../../config/db.config.js";
import { DEFAULT_ROLE_POLICIES } from "../../shared/authz/permissions.js";
import { getBusinessDateWib, isValidDateOnly } from "../../shared/utils/businessDate.js";

/**
 * Audit & migrasi data PaymentTerm legacy serta sinkronisasi RBAC role_policies (US-3):
 * - Hanya mengisi triggerDate dari dueDate jika triggerType === "date" & format dapat dipastikan.
 * - Mengisi readyAt dari ActivityLog/bastUploadedAt/invoiceIssuedAt jika status !== "planned" dan readyAt kosong.
 * - Tidak menghapus kolom triggerSprintId maupun dueDate.
 * - Menambahkan permission US-3 ke role_policies untuk owner & operasional secara idempotent.
 */
export async function migratePaymentTermsAndPolicies(): Promise<{
  totalTerms: number;
  backfilledTriggerDates: number;
  backfilledReadyAt: number;
  syncedRoles: string[];
}> {
  const terms = await prisma.paymentTerm.findMany({
    select: {
      id: true,
      projectId: true,
      triggerType: true,
      triggerDate: true,
      dueDate: true,
      status: true,
      readyAt: true,
      bastUploadedAt: true,
      invoiceIssuedAt: true,
      updatedAt: true,
    },
  });

  let backfilledTriggerDates = 0;
  let backfilledReadyAt = 0;

  for (const term of terms) {
    const updates: Record<string, unknown> = {};

    if (term.triggerType === "date" && !term.triggerDate && term.dueDate) {
      if (isValidDateOnly(term.dueDate)) {
        updates.triggerDate = term.dueDate;
      } else {
        const parsed = new Date(term.dueDate);
        if (!Number.isNaN(parsed.getTime())) {
          updates.triggerDate = getBusinessDateWib(parsed);
        }
      }
      if (updates.triggerDate) {
        backfilledTriggerDates += 1;
      }
    }

    if (term.status !== "planned" && !term.readyAt) {
      const logs = await prisma.activityLog.findMany({
        where: {
          projectId: term.projectId,
          category: "finance",
          action: { in: ["BAST_UPLOAD", "TERM_READY"] },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, metadata: true },
      });

      const matchingLog = logs.find(
        (log) =>
          log.metadata &&
          typeof log.metadata === "object" &&
          (log.metadata as Record<string, unknown>).termId === term.id
      );

      updates.readyAt =
        matchingLog?.createdAt ??
        term.bastUploadedAt ??
        term.invoiceIssuedAt ??
        term.updatedAt;
      backfilledReadyAt += 1;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.paymentTerm.update({
        where: { id: term.id },
        data: updates,
      });
    }
  }

  // Sinkronisasi role_policies secara idempotent untuk US-3
  const newPermissions = ["finance.payment_terms.manage", "finance.invoices.create"] as const;
  const syncedRoles: string[] = [];

  for (const role of ["owner", "operasional"] as const) {
    const existingPolicy = await prisma.rolePolicy.findUnique({ where: { role } });
    if (!existingPolicy) {
      await prisma.rolePolicy.create({
        data: {
          role,
          permissions: [...DEFAULT_ROLE_POLICIES[role]],
        },
      });
      syncedRoles.push(role);
    } else {
      const merged = Array.from(new Set([...existingPolicy.permissions, ...newPermissions]));
      if (merged.length !== existingPolicy.permissions.length) {
        await prisma.rolePolicy.update({
          where: { role },
          data: { permissions: merged },
        });
        syncedRoles.push(role);
      }
    }
  }

  return {
    totalTerms: terms.length,
    backfilledTriggerDates,
    backfilledReadyAt,
    syncedRoles,
  };
}
