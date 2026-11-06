import { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { env } from "../../config/env.config.js";
import { createCsrfToken, csrfCookieOptions } from "../../shared/middlewares/csrf.js";

const COOKIE_NAME = "token";

export const authController = {
  async csrf(_req: Request, res: Response): Promise<Response> {
    const token = createCsrfToken();
    res.cookie("csrfToken", token, csrfCookieOptions());
    return sendSuccess(res, "Token keamanan berhasil dibuat.", { token });
  },

  async login(req: Request, res: Response): Promise<Response> {
    const { token, user } = await authService.login(req.body);

    const maxAge = req.body.rememberMe
      ? 30 * 24 * 60 * 60 * 1000 // 30 hari
      : 7 * 24 * 60 * 60 * 1000; // 7 hari

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge,
    });

    return sendSuccess(res, "Login berhasil.", { user });
  },

  async logout(_req: Request, res: Response): Promise<Response> {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    });

    return sendSuccess(res, "Logout berhasil.", null);
  },

  async getMe(req: Request, res: Response): Promise<Response> {
    const user = await authService.getMe(req.user!.id);
    return sendSuccess(res, "Data profil berhasil dimuat.", { user });
  },

  async updateProfile(req: Request, res: Response): Promise<Response> {
    const user = await authService.updateProfile(req.user!.id, req.body);
    return sendSuccess(res, "Profil berhasil diperbarui.", { user });
  },

  async changePassword(req: Request, res: Response): Promise<Response> {
    await authService.changePassword(req.user!.id, req.body);
    return sendSuccess(res, "Password berhasil diperbarui.", null);
  },

  // === CONTROLLER RBAC & UNDANGAN (US-1) ===

  async invite(req: Request, res: Response): Promise<Response> {
    const invitation = await authService.inviteUser(req.user!.id, req.body);
    return sendSuccess(
      res,
      "Tautan undangan berhasil diterbitkan dan berlaku selama 24 jam.",
      { invitation },
      201
    );
  },

  async getInviteInfo(req: Request, res: Response): Promise<Response> {
    const token = req.params.token as string;
    const inviteInfo = await authService.getInviteInfo(token);
    return sendSuccess(res, "Informasi undangan berhasil dimuat.", inviteInfo);
  },

  async activate(req: Request, res: Response): Promise<Response> {
    const { token, user } = await authService.activateUser(req.body);

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return sendSuccess(
      res,
      "Aktivasi akun berhasil. Selamat datang di Cira PM!",
      { user },
      201
    );
  },

  async updateRole(req: Request, res: Response): Promise<Response> {
    const targetUserId = req.params.id as string;
    const user = await authService.updateUserRole(
      req.user!.id,
      targetUserId,
      req.body.roles
    );
    return sendSuccess(res, "Role anggota berhasil diperbarui.", { user });
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    const targetUserId = req.params.id as string;
    const user = await authService.updateUserStatus(
      req.user!.id,
      targetUserId,
      req.body.isActive
    );
    const msg = req.body.isActive
      ? "Akun anggota berhasil diaktifkan kembali."
      : "Akun anggota berhasil dinonaktifkan.";
    return sendSuccess(res, msg, { user });
  },

  async getDirectory(_req: Request, res: Response): Promise<Response> {
    const users = await authService.getDirectory();
    return sendSuccess(res, "Direktori tim berhasil dimuat.", { users });
  },
};
