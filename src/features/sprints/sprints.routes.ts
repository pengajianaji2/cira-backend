import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
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
  requirePermission("projects.read"),
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(sprintsController.getProjectSprints)
);

projectSprintsRouter.post(
  "/",
  requirePermission("sprints.write"),
  validateRequest({
    params: projectIdParamSchema,
    body: createSprintSchema,
  }),
  asyncHandler(sprintsController.createSprint)
);

projectSprintsRouter.get(
  "/progress",
  requirePermission("projects.read"),
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(sprintsController.getProjectProgress)
);

// Router langsung: /api/v1/sprints/:id
export const sprintsRouter = Router();
sprintsRouter.use(requireAuth);

sprintsRouter.get(
  "/:id",
  requirePermission("projects.read"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.getSprintById)
);

sprintsRouter.patch(
  "/:id",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: updateSprintSchema,
  }),
  asyncHandler(sprintsController.updateSprint)
);

sprintsRouter.post(
  "/:id/start",
  requirePermission("sprints.write"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.startSprint)
);

// AC-11: PATCH /api/v1/sprints/:id/complete (dan POST untuk fleksibilitas)
sprintsRouter.patch(
  "/:id/complete",
  requirePermission("sprints.write"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/complete",
  requirePermission("sprints.write"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/reopen",
  requirePermission("sprints.write"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.reopenSprint)
);

sprintsRouter.delete(
  "/:id",
  requirePermission("sprints.delete"),
  validateRequest({ params: sprintIdParamSchema }),
  asyncHandler(sprintsController.deleteSprint)
);

sprintsRouter.post(
  "/:id/tasks",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: assignTasksSchema,
  }),
  asyncHandler(sprintsController.assignTasks)
);

export default sprintsRouter;
