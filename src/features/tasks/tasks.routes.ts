import { Router } from "express";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { tasksController } from "./tasks.controller.js";
import {
  createTaskSchema,
  projectIdParamSchema,
  taskIdParamSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "./tasks.schema.js";

// Router untuk sub-rute proyek: /api/v1/projects/:projectId/tasks
export const projectTasksRouter = Router({ mergeParams: true });
projectTasksRouter.use(requireAuth);

projectTasksRouter.get(
  "/",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(tasksController.getProjectTasks)
);

projectTasksRouter.post(
  "/",
  validateRequest({
    params: projectIdParamSchema,
    body: createTaskSchema,
  }),
  asyncHandler(tasksController.createProjectTask)
);

// Router untuk rute langsung task: /api/v1/tasks/:id
export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.patch(
  "/:id/status",
  validateRequest({
    params: taskIdParamSchema,
    body: updateTaskStatusSchema,
  }),
  asyncHandler(tasksController.updateTaskStatus)
);

tasksRouter.patch(
  "/:id",
  validateRequest({
    params: taskIdParamSchema,
    body: updateTaskSchema,
  }),
  asyncHandler(tasksController.updateTask)
);

// AC-10 / RBAC: Hanya role owner dan operasional yang diizinkan menghapus task
tasksRouter.delete(
  "/:id",
  requireAnyRole("owner", "operasional"),
  validateRequest({ params: taskIdParamSchema }),
  asyncHandler(tasksController.deleteTask)
);

export default tasksRouter;
