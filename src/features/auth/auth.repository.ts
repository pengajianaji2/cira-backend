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

  async updateProfile(id: string, data: { name: string; email: string; whatsapp?: string; instagram?: string }) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
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
    avatarUrl?: string;
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

  async findInvitationByToken(token: string) {
    return prisma.userInvitation.findUnique({
      where: { token },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async deleteInvitationByToken(token: string) {
    return prisma.userInvitation.delete({
      where: { token },
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
      data: { isActive },
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
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: [
        { isPrimaryOwner: "desc" },
        { createdAt: "asc" },
      ],
    });
  },
};
