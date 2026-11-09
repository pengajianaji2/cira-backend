import { Router } from "express";
import {
  requireAuth,
  requirePermission,
} from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { operationsController } from "./operations.controller.js";
import {
  calendarQuerySchema,
  cancelOperationalEventSchema,
  createOperationalEventSchema,
  operationalEventIdParamSchema,
  recordReminderSchema,
  updateOperationalEventSchema,
} from "./operations.schema.js";

const operationsRouter = Router();

// Seluruh endpoint operasional wajib login
operationsRouter.use(requireAuth);

// GET /api/v1/operations/calendar — hanya Owner & Operasional berizin (Developer -> 403)
operationsRouter.get(
  "/calendar",
  requirePermission("operations.calendar.read"),
  validateRequest({ query: calendarQuerySchema }),
  asyncHandler(operationsController.getOperationalCalendar)
);

// Manajemen Agenda Manual (/api/v1/operations/events)
operationsRouter.post(
  "/events",
  requirePermission("operations.events.manage"),
  validateRequest({ body: createOperationalEventSchema }),
  asyncHandler(operationsController.createOperationalEvent)
);

operationsRouter.patch(
  "/events/:id",
  requirePermission("operations.events.manage"),
  validateRequest({
    params: operationalEventIdParamSchema,
    body: updateOperationalEventSchema,
  }),
  asyncHandler(operationsController.updateOperationalEvent)
);

operationsRouter.patch(
  "/events/:id/cancel",
  requirePermission("operations.events.manage"),
  validateRequest({
    params: operationalEventIdParamSchema,
    body: cancelOperationalEventSchema,
  }),
  asyncHandler(operationsController.cancelOperationalEvent)
);

operationsRouter.post(
  "/events/:id/remind",
  requirePermission("operations.events.manage"),
  validateRequest({
    params: operationalEventIdParamSchema,
    body: recordReminderSchema,
  }),
  asyncHandler(operationsController.recordReminder)
);

export default operationsRouter;
