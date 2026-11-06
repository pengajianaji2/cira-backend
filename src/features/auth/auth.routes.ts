import { Router } from "express";
import { authController } from "./auth.controller.js";
import {
  activateUserSchema,
  changePasswordSchema,
  inviteUserSchema,
  loginSchema,
  profileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from "./auth.schema.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { loginRateLimit } from "../../shared/middlewares/loginRateLimit.js";

const router = Router();

// CSRF & Autentikasi Dasar
router.get("/csrf", asyncHandler(authController.csrf));

router.post(
  "/login",
  loginRateLimit,
  validateRequest({ body: loginSchema }),
  asyncHandler(authController.login)
);

router.post("/logout", asyncHandler(authController.logout));

router.get("/me", requireAuth, asyncHandler(authController.getMe));

router.put(
  "/profile",
  requireAuth,
  validateRequest({ body: profileSchema }),
  asyncHandler(authController.updateProfile)
);

router.put(
  "/password",
  requireAuth,
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);

// RBAC & Alur Undangan Anggota (US-1)
router.post(
  "/invite",
  requireAuth,
  requireAnyRole("owner"),
  validateRequest({ body: inviteUserSchema }),
  asyncHandler(authController.invite)
);

router.get(
  "/invite/:token",
  asyncHandler(authController.getInviteInfo)
);

router.post(
  "/activate",
  validateRequest({ body: activateUserSchema }),
  asyncHandler(authController.activate)
);

// Manajemen Anggota (Role & Status Akun Aktif/Nonaktif)
router.patch(
  "/users/:id/role",
  requireAuth,
  requireAnyRole("owner"),
  validateRequest({ body: updateUserRoleSchema }),
  asyncHandler(authController.updateRole)
);

router.patch(
  "/users/:id/status",
  requireAuth,
  requireAnyRole("owner"),
  validateRequest({ body: updateUserStatusSchema }),
  asyncHandler(authController.updateStatus)
);

export default router;
