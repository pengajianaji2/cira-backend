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
};
