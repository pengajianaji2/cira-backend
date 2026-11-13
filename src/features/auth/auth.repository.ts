import { prisma } from "../../config/db.config.js";

export const authRepository = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async updateProfile(
    id: string,
    data: { name: string; email: string; whatsapp?: string | null; instagram?: string | null }
  ) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  },

  async revokeSessions(id: string) {
    return prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  },

  async updateAvatar(id: string, avatarFileId: string | null) {
    return prisma.user.update({ where: { id }, data: { avatarFileId } });
  },

  async createUser(data: {
    email: string;
    name: string;
    passwordHash: string;
    roles?: string[];
    whatsapp?: string;
    instagram?: string;
    isActive?: boolean;
    isPrimaryOwner?: boolean;
    avatarFileId?: string;
  }) {
    return prisma.user.create({
      data: {
        ...data,
        roles: data.roles || ["developer"],
        isActive: data.isActive ?? true,
        isPrimaryOwner: data.isPrimaryOwner ?? false,
      },
    });
  },

  async createInvitation(data: {
    email: string;
    role: string;
    token: string;
    expiresAt: Date;
    invitedById: string;
  }) {
    // Bersihkan undangan pending lama untuk email ini (BR-AUTH-08)
    await prisma.userInvitation.deleteMany({
      where: { email: data.email },
    });

    return prisma.userInvitation.create({
      data,
    });
  },

  async findInvitationByToken(tokenHash: string, legacyToken?: string) {
    return prisma.userInvitation.findFirst({
      where: { OR: legacyToken ? [{ token: tokenHash }, { token: legacyToken }] : [{ token: tokenHash }] },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async deleteInvitationById(id: string) {
    return prisma.userInvitation.delete({ where: { id } });
  },

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  },

  async findPasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  },

  async deletePasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
  },

  async consumePasswordReset(tokenHash: string, userId: string, passwordHash: string) {
    return prisma.$transaction(async (tx) => {
      const removed = await tx.passwordResetToken.deleteMany({
        where: { tokenHash, userId, expiresAt: { gt: new Date() } },
      });
      if (removed.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      return true;
    });
  },

  async deleteInvitationByToken(tokenHash: string, legacyToken?: string) {
    return prisma.userInvitation.deleteMany({
      where: { OR: legacyToken ? [{ token: tokenHash }, { token: legacyToken }] : [{ token: tokenHash }] },
    });
  },

  async activateUser(data: {
    email: string;
    name: string;
    passwordHash: string;
    roles: string[];
    whatsapp: string;
    instagram: string;
  }) {
    // Periksa apakah user sudah ada
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          passwordHash: data.passwordHash,
          roles: data.roles,
          whatsapp: data.whatsapp,
          instagram: data.instagram,
          isActive: true,
          tokenVersion: { increment: 1 },
        },
      });
    }

    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        roles: data.roles,
        whatsapp: data.whatsapp,
        instagram: data.instagram,
        isActive: true,
        isPrimaryOwner: false,
      },
    });
  },

  async updateUserRole(id: string, roles: string[]) {
    return prisma.user.update({
      where: { id },
      data: { roles },
    });
  },

  async updateUserStatus(id: string, isActive: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isActive, tokenVersion: { increment: 1 } },
    });
  },

  async getDirectoryUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
        instagram: true,
        roles: true,
        isActive: true,
        isPrimaryOwner: true,
        avatarFileId: true,
        createdAt: true,
      },
      orderBy: [
        { isPrimaryOwner: "desc" },
        { createdAt: "asc" },
      ],
    });
  },
};
