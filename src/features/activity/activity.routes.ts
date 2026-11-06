import { Router } from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
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
  validateRequest({
    params: projectIdParamSchema,
    query: activityFilterQuerySchema,
  }),
  asyncHandler(activityController.getProjectActivities)
);

projectActivitiesRouter.post(
  "/",
  validateRequest({
    params: projectIdParamSchema,
    body: createActivitySchema,
  }),
  asyncHandler(activityController.logActivity)
);

export default projectActivitiesRouter;
