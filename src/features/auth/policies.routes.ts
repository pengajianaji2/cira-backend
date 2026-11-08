import { Router } from "express";
import { z } from "zod";
import { requireAnyRole, requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { policiesService } from "./policies.service.js";
import { PERMISSION_CATALOG } from "../../shared/authz/permissions.js";

const router = Router();
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const permissions = await policiesService.forRoles(req.user!.roles);
  return sendSuccess(res, "Policy pengguna berhasil dimuat.", { permissions });
}));
router.use(requireAuth, requireAnyRole("owner"));
router.get("/", requirePermission("policies.manage"), asyncHandler(async (_req, res) => {
  const policies = await policiesService.list();
  return sendSuccess(res, "Policy akses berhasil dimuat.", { policies, permissions: PERMISSION_CATALOG });
}));
router.get("/history", requirePermission("policies.manage"), asyncHandler(async (_req, res) => {
  const history = await policiesService.history();
  return sendSuccess(res, "Riwayat policy akses berhasil dimuat.", { history });
}));
router.put("/:role", requirePermission("policies.manage"), validateRequest({
  params: z.object({ role: z.enum(["owner", "developer", "operasional"]) }),
  body: z.object({ permissions: z.array(z.string()).max(50) }),
}), asyncHandler(async (req, res) => {
  const policy = await policiesService.update(req.user!.id, req.params.role as string, req.body.permissions);
  return sendSuccess(res, "Policy role berhasil diperbarui.", { policy });
}));
export default router;
