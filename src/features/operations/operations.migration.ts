import { prisma } from "../../config/db.config.js";
import { DEFAULT_ROLE_POLICIES } from "../../shared/authz/permissions.js";

/**
 * Sinkronisasi idempotent RBAC role_policies untuk US-4:
 * - Menambahkan operations.calendar.read & operations.events.manage ke owner dan operasional.
 * - Memastikan developer tidak memiliki izin kalender global atau agenda operasional (AC-4.4).
 */
export async function migrateOperationsPolicies(): Promise<{
  syncedRoles: string[];
}> {
  const opsPermissions = ["operations.calendar.read", "operations.events.manage"] as const;
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
      const merged = Array.from(new Set([...existingPolicy.permissions, ...opsPermissions]));
      if (merged.length !== existingPolicy.permissions.length) {
        await prisma.rolePolicy.update({
          where: { role },
          data: { permissions: merged },
        });
        syncedRoles.push(role);
      }
    }
  }

  // Pastikan Developer tidak memegang permission kalender global/agenda bila row DB ada
  const devPolicy = await prisma.rolePolicy.findUnique({ where: { role: "developer" } });
  if (devPolicy) {
    const cleaned = devPolicy.permissions.filter(
      (perm) => !opsPermissions.includes(perm as (typeof opsPermissions)[number])
    );
    if (cleaned.length !== devPolicy.permissions.length) {
      await prisma.rolePolicy.update({
        where: { role: "developer" },
        data: { permissions: cleaned },
      });
      syncedRoles.push("developer(cleaned)");
    }
  }

  return { syncedRoles };
}
