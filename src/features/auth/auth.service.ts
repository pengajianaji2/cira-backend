import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { authRepository } from "./auth.repository.js";
import {
  ActivateUserInput,
  ChangePasswordInput,
  DirectoryUserResponse,
  InviteUserInput,
  LoginInput,
  ProfileInput,
  UserInvitationResponse,
  UserResponse,
} from "./auth.types.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";
import { env } from "../../config/env.config.js";

const toUserResponse = (user: any): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roles: Array.isArray(user.roles) ? user.roles : ["developer"],
  whatsapp: user.whatsapp ?? null,
  instagram: user.instagram ?? null,
  isActive: user.isActive ?? true,
  isPrimaryOwner: user.isPrimaryOwner ?? false,
  avatarUrl: user.avatarUrl ?? null,
  createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
});

export const authService = {
  async login(input: LoginInput): Promise<{ token: string; user: UserResponse }> {
    const user = await authRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError("Email atau password tidak sesuai.");
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Email atau password tidak sesuai.");
    }

    // Blokir login jika akun dinonaktifkan (BR-AUTH-12)
    if (user.isActive === false) {
      throw new UnauthorizedError("Akun Anda telah dinonaktifkan. Silakan hubungi Owner.");
    }

    const expiresIn: string | number = input.rememberMe ? "30d" : env.JWT_EXPIRES_IN;
    const signOptions: SignOptions = {
      expiresIn: expiresIn as unknown as SignOptions["expiresIn"],
    };

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
      env.JWT_SECRET,
      signOptions
    );

    return {
      token,
      user: toUserResponse(user),
    };
  },

  async getMe(userId: string): Promise<UserResponse> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Pengguna tidak ditemukan.");
    }
    return toUserResponse(user);
  },

  async updateProfile(userId: string, input: ProfileInput): Promise<UserResponse> {
    const existing = await authRepository.findByEmail(input.email);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Email ini telah digunakan oleh akun lain.");
    }

    const updated = await authRepository.updateProfile(userId, {
      name: input.name,
      email: input.email,
      whatsapp: input.whatsapp,
      instagram: input.instagram?.replace(/^@/, ""),
    });

    return toUserResponse(updated);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Pengguna tidak ditemukan.");
    }

    const isMatch = await bcrypt.compare(input.oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestError("Password lama tidak sesuai.");
    }

    const newHash = await bcrypt.hash(input.newPassword, 10);
    await authRepository.updatePassword(userId, newHash);
  },

  // === FITUR RBAC & UNDANGAN (US-1) ===

  async inviteUser(
    inviterId: string,
    input: InviteUserInput
  ): Promise<UserInvitationResponse> {
    const inviter = await authRepository.findById(inviterId);
    if (!inviter || !inviter.roles.includes("owner")) {
      throw new ForbiddenError("Hanya Owner yang berhak mengundang anggota baru.");
    }

    // Role Owner tidak boleh diberikan via undangan (BR-AUTH-02, BR-AUTH-06)
    if (input.role !== "developer" && input.role !== "operasional") {
      throw new BadRequestError("Role undangan hanya boleh developer atau operasional.");
    }

    const existingUser = await authRepository.findByEmail(input.email);
    if (existingUser && existingUser.isActive) {
      throw new ConflictError("Pengguna dengan email ini sudah aktif terdaftar.");
    }

    // Buat token kriptografis 24 jam (BR-AUTH-07, BR-AUTH-08)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const invitation = await authRepository.createInvitation({
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      expiresAt,
      invitedById: inviterId,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  },

  async getInviteInfo(token: string) {
    const invitation = await authRepository.findInvitationByToken(token);
    if (!invitation) {
      throw new NotFoundError("Tautan undangan tidak valid.");
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestError("Tautan undangan telah kedaluwarsa (berlaku 24 jam). Silakan minta Owner mengirim ulang.");
    }

    return {
      email: invitation.email,
      role: invitation.role,
      invitedBy: invitation.invitedBy?.name ?? "Owner",
      expiresAt: invitation.expiresAt.toISOString(),
    };
  },

  async activateUser(
    input: ActivateUserInput
  ): Promise<{ token: string; user: UserResponse }> {
    const invitation = await authRepository.findInvitationByToken(input.token);
    if (!invitation) {
      throw new NotFoundError("Tautan aktivasi tidak valid.");
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestError("Tautan aktivasi telah kedaluwarsa.");
    }

    if (input.confirmPassword && input.password !== input.confirmPassword) {
      throw new BadRequestError("Konfirmasi password tidak cocok dengan password baru.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const cleanInstagram = input.instagram.replace(/^@/, "").trim();

    // Simpan akun aktif (BR-AUTH-09, BR-AUTH-10)
    const activatedUser = await authRepository.activateUser({
      email: invitation.email,
      name: input.name.trim(),
      passwordHash,
      roles: [invitation.role],
      whatsapp: input.whatsapp.trim(),
      instagram: cleanInstagram,
    });

    // Hapus token undangan sekali pakai (BR-AUTH-07)
    await authRepository.deleteInvitationByToken(input.token);

    // Langsung terbitkan sesi token untuk kemudahan login
    const sessionToken = jwt.sign(
      {
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        roles: activatedUser.roles,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as unknown as SignOptions["expiresIn"] }
    );

    return {
      token: sessionToken,
      user: toUserResponse(activatedUser),
    };
  },

  async updateUserRole(
    actorId: string,
    targetUserId: string,
    newRoles: string[]
  ): Promise<UserResponse> {
    const actor = await authRepository.findById(actorId);
    if (!actor || !actor.roles.includes("owner")) {
      throw new ForbiddenError("Hanya Owner yang dapat mengubah role anggota.");
    }

    const targetUser = await authRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError("Pengguna target tidak ditemukan.");
    }

    // Role Owner utama (BR-AUTH-03, BR-AUTH-04)
    if (targetUser.isPrimaryOwner) {
      // Owner utama boleh memiliki ["owner"] atau ["owner", "developer"]
      const isOwnerValid =
        newRoles.includes("owner") &&
        newRoles.every((r) => r === "owner" || r === "developer");
      if (!isOwnerValid) {
        throw new BadRequestError("Owner utama hanya boleh memiliki role 'owner' atau 'owner' + 'developer'.");
      }
    } else {
      // Anggota lain tidak boleh diberi role owner (BR-AUTH-02)
      if (newRoles.includes("owner")) {
        throw new ForbiddenError("Role Owner tidak dapat diberikan ke anggota lain.");
      }
      // Anggota lain harus tepat satu role: developer atau operasional (BR-AUTH-04)
      if (newRoles.length !== 1 || (!newRoles.includes("developer") && !newRoles.includes("operasional"))) {
        throw new BadRequestError("Anggota tim harus memiliki tepat satu role: 'developer' atau 'operasional'.");
      }
    }

    const updated = await authRepository.updateUserRole(targetUserId, newRoles);
    return toUserResponse(updated);
  },

  async updateUserStatus(
    actorId: string,
    targetUserId: string,
    isActive: boolean
  ): Promise<UserResponse> {
    const actor = await authRepository.findById(actorId);
    if (!actor || !actor.roles.includes("owner")) {
      throw new ForbiddenError("Hanya Owner yang dapat mengubah status akun anggota.");
    }

    const targetUser = await authRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError("Pengguna target tidak ditemukan.");
    }

    // Owner utama tidak dapat dinonaktifkan (BR-AUTH-05)
    if (targetUser.isPrimaryOwner && !isActive) {
      throw new ForbiddenError("Akun Owner utama tidak dapat dinonaktifkan.");
    }

    if (actorId === targetUserId && !isActive) {
      throw new ForbiddenError("Anda tidak dapat menonaktifkan akun sendiri.");
    }

    const updated = await authRepository.updateUserStatus(targetUserId, isActive);
    return toUserResponse(updated);
  },

  async getDirectory(): Promise<DirectoryUserResponse[]> {
    const users = await authRepository.getDirectoryUsers();
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      whatsapp: u.whatsapp,
      instagram: u.instagram,
      roles: u.roles,
      isActive: u.isActive,
      isPrimaryOwner: u.isPrimaryOwner,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt.toISOString(),
    }));
  },
};
