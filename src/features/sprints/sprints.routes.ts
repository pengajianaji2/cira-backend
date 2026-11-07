import { Router } from "express";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { sprintsController } from "./sprints.controller.js";
import {
  assignTasksSchema,
  createSprintSchema,
  sprintIdParamSchema,
  updateSprintSchema,
} from "./sprints.schema.js";
import { projectIdParamSchema } from "../tasks/tasks.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/sprints
export const projectSprintsRouter = Router({ mergeParams: true });
projectSprintsRouter.use(requireAuth);

projectSprintsRouter.get(
  "/",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(sprintsController.getProjectSprints)
);

projectSprintsRouter.post(
  "/",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({
    params: projectIdParamSchema,
    body: createSprintSchema,
  }),
  asyncHandler(sprintsController.createSprint)
);

projectSprintsRouter.get(
  "/progress",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(sprintsController.getProjectProgress)
);

// Router langsung: /api/v1/sprints/:id
export const sprintsRouter = Router();
sprintsRouter.use(requireAuth);

sprintsRouter.get(
  "/:id",
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.getSprintById)
);

sprintsRouter.patch(
  "/:id",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({
    params: sprintIdParamSchema,
    body: updateSprintSchema,
  }),
  asyncHandler(sprintsController.updateSprint)
);

sprintsRouter.post(
  "/:id/start",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.startSprint)
);

// AC-11: PATCH /api/v1/sprints/:id/complete (dan POST untuk fleksibilitas)
sprintsRouter.patch(
  "/:id/complete",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/complete",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/reopen",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.reopenSprint)
);

sprintsRouter.delete(
  "/:id",
  requireAnyRole("owner", "operasional"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.deleteSprint)
);

sprintsRouter.post(
  "/:id/tasks",
  requireAnyRole("owner", "operasional", "developer"),
  validateRequest({
    params: sprintIdParamSchema,
    body: assignTasksSchema,
  }),
  asyncHandler(sprintsController.assignTasks)
);

export default sprintsRouter;
