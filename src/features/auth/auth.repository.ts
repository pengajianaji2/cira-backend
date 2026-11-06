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

  async updateProfile(id: string, data: { name: string; email: string }) {
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
    avatarUrl?: string;
  }) {
    return prisma.user.create({
      data: {
        ...data,
        roles: data.roles || ["dev"],
      },
    });
  },
};
