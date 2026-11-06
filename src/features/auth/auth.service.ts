import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { authRepository } from "./auth.repository.js";
import {
  ChangePasswordInput,
  LoginInput,
  ProfileInput,
  UserResponse,
} from "./auth.types.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../shared/errors/AppError.js";
import { env } from "../../config/env.config.js";

const toUserResponse = (user: any): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roles: user.roles,
  avatarUrl: user.avatarUrl,
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
};
