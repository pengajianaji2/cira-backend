import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { requireProjectResourceAccess } from "../../shared/middlewares/projectAccess.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema, taskIdParamSchema } from "../tasks/tasks.schema.js";
import { assetsController } from "./assets.controller.js";
import { cleanupAssetUploadSchema, createAssetUploadSchema, createDesignAssetSchema } from "./assets.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/assets
export const projectAssetsRouter = Router({ mergeParams: true });
projectAssetsRouter.use(requireAuth);

projectAssetsRouter.get(
  "/",
  requirePermission("projects.read"),
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(assetsController.getProjectAssets)
);

projectAssetsRouter.post(
  "/upload-signature",
  requirePermission("assets.write"),
  validateRequest({ params: projectIdParamSchema, body: createAssetUploadSchema }),
  asyncHandler(assetsController.createUploadSignature)
);

projectAssetsRouter.delete(
  "/upload/:publicId",
  requirePermission("assets.write"),
  validateRequest({ params: cleanupAssetUploadSchema }),
  asyncHandler(assetsController.cleanupOrphanUpload)
);

projectAssetsRouter.post(
  "/",
  requirePermission("assets.write"),
  validateRequest({
    params: projectIdParamSchema,
    body: createDesignAssetSchema,
  }),
  asyncHandler(assetsController.createAsset)
);

// Rute langsung: /api/v1/assets/:id
export const assetsRouter = Router();
assetsRouter.use(requireAuth);

assetsRouter.delete(
  "/:id",
  requirePermission("assets.write"),
  validateRequest({ params: taskIdParamSchema }),
  requireProjectResourceAccess("asset"),
  asyncHandler(assetsController.deleteAsset)
);

export default assetsRouter;
