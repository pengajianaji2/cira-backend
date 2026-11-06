import { Router } from "express";
import { authController } from "./auth.controller.js";
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
} from "./auth.schema.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { loginRateLimit } from "../../shared/middlewares/loginRateLimit.js";

const router = Router();

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

export default router;
