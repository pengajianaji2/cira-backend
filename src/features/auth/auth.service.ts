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
import { emailService } from "../../shared/services/email.service.js";
import { cloudinaryStorage } from "../assets/cloudinary.service.js";

const toUserResponse = (user: any): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roles: Array.isArray(user.roles) ? user.roles : ["developer"],
  whatsapp: user.whatsapp ?? null,
  instagram: user.instagram ?? null,
  isActive: user.isActive ?? true,
  isPrimaryOwner: user.isPrimaryOwner ?? false,
  avatarUrl: user.avatarUrl ? cloudinaryStorage.deliveryUrl(user.avatarUrl) : null,
  createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
});

/** Service domain autentikasi, sesi JWT, aktivasi token undangan 24 jam, reset password, serta administrasi role & status anggota. */
export const authService = {
  /**
   * Memverifikasi kredensial email/password pengguna aktif dan menerbitkan JWT sesi HS256 (`7d` default atau `30d` bila `rememberMe`).
   *
   * @throws {UnauthorizedError} Bila kredensial salah atau akun telah dinonaktifkan.
   */
  async login(input: LoginInput): Promise<{ token: string; user: UserResponse }> {
    const user = await authRepository.findByEmail(input.email.toLowerCase());
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
        tokenVersion: user.tokenVersion,
      },
      env.JWT_SECRET,
      signOptions
    );

    return {
      token,
      user: toUserResponse(user),
    };
  },

  /** Mengambil profil pengguna terautentikasi berdasarkan ID dengan delivery URL avatar tersigned. */
  async getMe(userId: string): Promise<UserResponse> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Pengguna tidak ditemukan.");
    }
    return toUserResponse(user);
  },

  async updateProfile(userId: string, input: ProfileInput): Promise<UserResponse> {
    const email = input.email.toLowerCase();
    const existing = await authRepository.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Email ini telah digunakan oleh akun lain.");
    }

    const updated = await authRepository.updateProfile(userId, {
      name: input.name,
      email,
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

  async logout(userId: string): Promise<void> {
    await authRepository.revokeSessions(userId);
  },

  async uploadAvatar(userId: string, dataUrl: string): Promise<UserResponse> {
    const user = await authRepository.findById(userId);
    if (!user) throw new NotFoundError("Pengguna tidak ditemukan.");
    const uploaded = await cloudinaryStorage.upload(dataUrl, `cira-pm/avatars/${userId}`);
    try {
      const updated = await authRepository.updateAvatar(userId, uploaded);
      if (user.avatarUrl) await cloudinaryStorage.destroy(user.avatarUrl).catch(() => undefined);
      return toUserResponse(updated);
    } catch (error) {
      await cloudinaryStorage.destroy(uploaded).catch(() => undefined);
      throw error;
    }
  },

  /** Membuat token reset password 30 menit sekali pakai (hash SHA-256) dan mengirim email bila akun aktif. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await authRepository.findByEmail(email.toLowerCase());
    if (!user || !user.isActive) return;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await authRepository.createPasswordResetToken(user.id, tokenHash, expiresAt);
    const baseUrl = (env.APP_PUBLIC_URL || env.FRONTEND_URL).replace(/\/$/, "");
    // Fragments are not sent in the initial HTTP request or Referer header.
    const link = `${baseUrl}/reset-password#token=${encodeURIComponent(token)}`;
    try {
      await emailService.send(user.email, "Atur ulang password Cira PM", emailService.passwordResetHtml(link, 30), emailService.passwordResetText(link, 30));
    } catch (error) {
      await authRepository.deletePasswordResetToken(tokenHash);
      throw error;
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = await authRepository.findPasswordResetToken(tokenHash);
    if (!reset || reset.expiresAt <= new Date() || !reset.user.isActive) {
      throw new BadRequestError("Tautan reset tidak valid atau telah kedaluwarsa.");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const consumed = await authRepository.consumePasswordReset(tokenHash, reset.userId, passwordHash);
    if (!consumed) throw new BadRequestError("Tautan reset tidak valid atau telah digunakan.");
  },

  // === FITUR RBAC & UNDANGAN (US-1) ===

  /**
   * Membuat token undangan aktivasi 24 jam (hash SHA-256) untuk role `developer` atau `operasional`
   * serta mengirimkannya via email; melakukan rollback undangan bila pengiriman email gagal.
   *
   * @throws {ForbiddenError} Bila pengundang bukan Owner.
   * @throws {BadRequestError} Bila role target bukan `developer` atau `operasional`.
   * @throws {ConflictError} Bila email sudah terdaftar pada akun aktif.
   */
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

    const existingUser = await authRepository.findByEmail(input.email.toLowerCase());
    if (existingUser && existingUser.isActive) {
      throw new ConflictError("Pengguna dengan email ini sudah aktif terdaftar.");
    }

    // Buat token kriptografis 24 jam (BR-AUTH-07, BR-AUTH-08)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const invitation = await authRepository.createInvitation({
      email: input.email.toLowerCase(),
      role: input.role,
      token: tokenHash,
      expiresAt,
      invitedById: inviterId,
    });

    const baseUrl = (env.APP_PUBLIC_URL || env.FRONTEND_URL).replace(/\/$/, "");
    const link = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;
    try {
      await emailService.send(
        invitation.email,
        "Undangan bergabung ke Cira PM",
        emailService.invitationHtml("", link, invitation.role, invitation.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })),
        emailService.invitationText("", link, invitation.role, invitation.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })),
      );
    } catch (error) {
      await authRepository.deleteInvitationById(invitation.id);
      throw error;
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      emailSent: true,
    };
  },

  async getInviteInfo(token: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invitation = await authRepository.findInvitationByToken(tokenHash, token);
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

  /** Mengaktifkan akun baru dari token undangan sekali pakai, menyimpan profil WhatsApp/Instagram, dan menerbitkan JWT sesi. */
  async activateUser(
    input: ActivateUserInput
  ): Promise<{ token: string; user: UserResponse }> {
    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
    const invitation = await authRepository.findInvitationByToken(tokenHash, input.token);
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
    await authRepository.deleteInvitationByToken(tokenHash, input.token);

    // Langsung terbitkan sesi token untuk kemudahan login
    const sessionToken = jwt.sign(
      {
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        roles: activatedUser.roles,
        tokenVersion: activatedUser.tokenVersion,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as unknown as SignOptions["expiresIn"] }
    );

    return {
      token: sessionToken,
      user: toUserResponse(activatedUser),
    };
  },

  /** Memperbarui role anggota tim khusus oleh Owner (`owner+developer` untuk Owner utama, tepat 1 role untuk non-Owner). */
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

  /** Mengaktifkan atau menonaktifkan akun anggota oleh Owner (melindungi Owner utama dan akun sendiri). */
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

  /** Mengambil daftar lengkap anggota tim beserta informasi kontak dan status aktif untuk direktori tim. */
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
      avatarUrl: u.avatarUrl ? cloudinaryStorage.deliveryUrl(u.avatarUrl) : null,
      createdAt: u.createdAt.toISOString(),
    }));
  },
};
