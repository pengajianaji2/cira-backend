import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { requireProjectResourceAccess } from "../../shared/middlewares/projectAccess.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { sprintsController } from "./sprints.controller.js";
import {
  assignTasksSchema,
  closeSprintSchema,
  createSprintSchema,
  sprintIdParamSchema,
  startSprintSchema,
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
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.getSprintById)
);

sprintsRouter.patch(
  "/:id",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: updateSprintSchema,
  }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.updateSprint)
);

// BR-SPRINT-02: POST /api/v1/sprints/:id/start dengan startSprintSchema
sprintsRouter.post(
  "/:id/start",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: startSprintSchema,
  }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.startSprint)
);

// BR-SPRINT-03 s.d. BR-SPRINT-05: Penutupan sprint dengan resolusi task (closeSprintSchema)
sprintsRouter.patch(
  "/:id/complete",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: closeSprintSchema,
  }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/complete",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: closeSprintSchema,
  }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.completeSprint)
);

sprintsRouter.post(
  "/:id/reopen",
  requirePermission("sprints.write"),
  validateRequest({ params: sprintIdParamSchema }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.reopenSprint)
);

sprintsRouter.delete(
  "/:id",
  requirePermission("sprints.delete"),
  validateRequest({ params: sprintIdParamSchema }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.deleteSprint)
);

sprintsRouter.post(
  "/:id/tasks",
  requirePermission("sprints.write"),
  validateRequest({
    params: sprintIdParamSchema,
    body: assignTasksSchema,
  }),
  requireProjectResourceAccess("sprint"),
  asyncHandler(sprintsController.assignTasks)
);

export default sprintsRouter;
