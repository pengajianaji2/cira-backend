import { Router } from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema, taskIdParamSchema } from "../tasks/tasks.schema.js";
import { assetsController } from "./assets.controller.js";
import { createDesignAssetSchema } from "./assets.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/assets
export const projectAssetsRouter = Router({ mergeParams: true });
projectAssetsRouter.use(requireAuth);

projectAssetsRouter.get(
  "/",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(assetsController.getProjectAssets)
);

projectAssetsRouter.post(
  "/",
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
  validateRequest({ params: taskIdParamSchema }),
  asyncHandler(assetsController.deleteAsset)
);

export default assetsRouter;
