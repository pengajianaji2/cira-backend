import { Router } from "express";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema } from "../tasks/tasks.schema.js";
import { financeController } from "./finance.controller.js";
import {
  createPaymentSchema,
  paymentIdParamSchema,
  updatePaymentSchema,
  verifyPaymentSchema,
} from "./finance.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/payments
export const projectPaymentsRouter = Router({ mergeParams: true });
projectPaymentsRouter.use(requireAuth);
// PRD: data pembayaran dikelola oleh Owner / Ops.
projectPaymentsRouter.use(requireAnyRole("owner", "ops"));

projectPaymentsRouter.get(
  "/",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(financeController.getProjectPayments)
);

projectPaymentsRouter.post(
  "/",
  validateRequest({
    params: projectIdParamSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(financeController.createProjectPayment)
);

// Rute langsung pembayaran: /api/v1/payments/:id
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);
// Lindungi pembacaan dan mutasi pembayaran pada endpoint langsung.
paymentsRouter.use(requireAnyRole("owner", "ops"));

paymentsRouter.patch(
  "/:id/verify",
  validateRequest({
    params: paymentIdParamSchema,
    body: verifyPaymentSchema,
  }),
  asyncHandler(financeController.verifyPayment)
);

paymentsRouter.patch(
  "/:id",
  validateRequest({
    params: paymentIdParamSchema,
    body: updatePaymentSchema,
  }),
  asyncHandler(financeController.updatePayment)
);

paymentsRouter.delete(
  "/:id",
  validateRequest({ params: paymentIdParamSchema }),
  asyncHandler(financeController.deletePayment)
);

export default paymentsRouter;
