import { Router } from "express";
import { authController } from "../auth/auth.controller.js";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

const router = Router();

// Direktori anggota tim (dapat diakses oleh seluruh pengguna aktif yang login) (BR-DIR-01, AC-B1-5)
router.get("/directory", requireAuth, requirePermission("directory.read"), asyncHandler(authController.getDirectory));

export default router;
