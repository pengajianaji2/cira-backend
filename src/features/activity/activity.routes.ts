import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema } from "../tasks/tasks.schema.js";
import { activityController } from "./activity.controller.js";
import {
  activityFilterQuerySchema,
  createActivitySchema,
} from "./activity.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/activities
export const projectActivitiesRouter = Router({ mergeParams: true });
projectActivitiesRouter.use(requireAuth);

projectActivitiesRouter.get(
  "/",
  requirePermission("activities.read"),
  validateRequest({
    params: projectIdParamSchema,
    query: activityFilterQuerySchema,
  }),
  asyncHandler(activityController.getProjectActivities)
);

// Activity history is created only by trusted domain services, never supplied by a browser client.

export default projectActivitiesRouter;
