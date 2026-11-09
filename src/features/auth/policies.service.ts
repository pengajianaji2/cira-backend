import { prisma } from "../../config/db.config.js";
import { BadRequestError, ForbiddenError } from "../../shared/errors/AppError.js";
import { DEFAULT_ROLE_POLICIES, PERMISSION_CATALOG, PermissionKey } from "../../shared/authz/permissions.js";

/** Service pengelolaan permission matrix RBAC dinamis per role (`RolePolicy`) beserta histori audit perubahannya. */
export const policiesService = {
  /** Mengambil daftar lengkap policy permission untuk seluruh role standar (`owner`, `developer`, `operasional`). */
  async list() {
    const saved = await prisma.rolePolicy.findMany({ orderBy: { role: "asc" } });
    const byRole = new Map(saved.map((item) => [item.role, item.permissions]));
    return Object.keys(DEFAULT_ROLE_POLICIES).map((role) => ({
      role,
      permissions: byRole.get(role) ?? DEFAULT_ROLE_POLICIES[role],
    }));
  },

  /** Memeriksa apakah gabungan role pengguna (`union` termasuk alias `ops`/`dev`) memiliki suatu permission. */
  async hasAny(roles: string[], permission: string): Promise<boolean> {
    const knownRoles = roles.map((role) => role === "ops" ? "operasional" : role === "dev" ? "developer" : role).filter((role) => role in DEFAULT_ROLE_POLICIES);
    if (!knownRoles.length) return false;
    const records = await prisma.rolePolicy.findMany({ where: { role: { in: knownRoles } } });
    const byRole = new Map(records.map((record) => [record.role, record.permissions]));
    return knownRoles.some((role) =>
      (byRole.get(role) ?? DEFAULT_ROLE_POLICIES[role] ?? []).includes(permission as PermissionKey),
    );
  },

  /** Mengembalikan himpunan unik permission keys aktif hasil gabungan (`union`) seluruh role pengguna. */
  async forRoles(roles: string[]): Promise<string[]> {
    const knownRoles = roles.map((role) => role === "ops" ? "operasional" : role === "dev" ? "developer" : role).filter((role) => role in DEFAULT_ROLE_POLICIES);
    const records = await prisma.rolePolicy.findMany({ where: { role: { in: knownRoles } } });
    const byRole = new Map(records.map((record) => [record.role, record.permissions]));
    return [...new Set(knownRoles.flatMap((role) => byRole.get(role) ?? DEFAULT_ROLE_POLICIES[role] ?? []))];
  },

  /**
   * Memperbarui daftar permission untuk role tertentu serta mencatat delta penambahan/pencabutan
   * ke tabel `RolePolicyHistory` dalam satu transaksi Prisma.
   *
   * @throws {BadRequestError} Bila nama role atau salah satu permission key tidak valid.
   * @throws {ForbiddenError} Bila mencoba mencabut `policies.manage` dari role `owner`.
   */
  async update(actorId: string, role: string, permissions: string[]) {
    if (!(role in DEFAULT_ROLE_POLICIES)) throw new BadRequestError("Role tidak dikenal.");
    const valid = new Set(PERMISSION_CATALOG.map((item) => item.key));
    if (permissions.some((permission) => !valid.has(permission as PermissionKey))) {
      throw new BadRequestError("Policy memuat permission yang tidak dikenal.");
    }
    if (role === "owner" && !permissions.includes("policies.manage")) {
      throw new ForbiddenError("Permission pengelolaan policy harus tetap tersedia untuk owner.");
    }
    const nextPermissions = [...new Set(permissions)];
    return prisma.$transaction(async (tx) => {
      const current = await tx.rolePolicy.findUnique({ where: { role } });
      const previous = current?.permissions ?? DEFAULT_ROLE_POLICIES[role];
      const addedPermissions = nextPermissions.filter((permission) => !previous.includes(permission));
      const removedPermissions = previous.filter((permission) => !nextPermissions.includes(permission));
      const updated = await tx.rolePolicy.upsert({
        where: { role },
        create: { role, permissions: nextPermissions, updatedById: actorId },
        update: { permissions: nextPermissions, updatedById: actorId },
      });
      if (addedPermissions.length || removedPermissions.length) {
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { email: true } });
        await tx.rolePolicyHistory.create({ data: { role, actorId, actorEmail: actor?.email ?? "unknown", addedPermissions, removedPermissions } });
      }
      return updated;
    });
  },

  /** Mengambil 100 entri riwayat perubahan policy RBAC terbaru. */
  async history() {
    return prisma.rolePolicyHistory.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  },
};
