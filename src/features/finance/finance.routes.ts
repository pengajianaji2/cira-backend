import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema } from "../tasks/tasks.schema.js";
import { financeController } from "./finance.controller.js";
import {
  createContractSchema,
  createPaymentSchema,
  issueInvoiceSchema,
  paymentIdParamSchema,
  paymentTermIdParamSchema,
  updatePaymentSchema,
  uploadBastSchema,
  verifyPaymentSchema,
} from "./finance.schema.js";

// Sub-rute proyek: /api/v1/projects/:projectId/payments
export const projectPaymentsRouter = Router({ mergeParams: true });
projectPaymentsRouter.use(requireAuth);

projectPaymentsRouter.get(
  "/",
  requirePermission("finance.read"),
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(financeController.getProjectPayments)
);

projectPaymentsRouter.post(
  "/",
  requirePermission("finance.write"),
  validateRequest({
    params: projectIdParamSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(financeController.createProjectPayment)
);

// Rute langsung pembayaran: /api/v1/payments/:id
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);
paymentsRouter.patch(
  "/:id/verify",
  requirePermission("finance.write"),
  validateRequest({
    params: paymentIdParamSchema,
    body: verifyPaymentSchema,
  }),
  asyncHandler(financeController.verifyPayment)
);

paymentsRouter.patch(
  "/:id",
  requirePermission("finance.write"),
  validateRequest({
    params: paymentIdParamSchema,
    body: updatePaymentSchema,
  }),
  asyncHandler(financeController.updatePayment)
);

paymentsRouter.delete(
  "/:id",
  requirePermission("finance.write"),
  validateRequest({ params: paymentIdParamSchema }),
  asyncHandler(financeController.deletePayment)
);

// =========================================================================
// US-4: Rute Langsung Termin & Penerbitan Invoice (/api/v1/payment-terms/:id)
// =========================================================================
export const paymentTermsRouter = Router();
paymentTermsRouter.use(requireAuth);

paymentTermsRouter.get(
  "/:id",
  requirePermission("finance.read"),
  validateRequest({ params: paymentTermIdParamSchema }),
  asyncHandler(financeController.getTermById)
);

// AC-14: Upload BAST dan tandai status siap ditagih (ready)
paymentTermsRouter.patch(
  "/:id/ready",
  requirePermission("finance.write"),
  validateRequest({
    params: paymentTermIdParamSchema,
    body: uploadBastSchema,
  }),
  asyncHandler(financeController.markTermReadyWithBast)
);

// AC-15: Terbitkan invoice resmi bernomor unik INV-YYYY-NNN/Tn dan kunci termin
paymentTermsRouter.post(
  "/:id/invoice",
  requirePermission("finance.write"),
  validateRequest({
    params: paymentTermIdParamSchema,
    body: issueInvoiceSchema,
  }),
  asyncHandler(financeController.issueTermInvoice)
);

paymentTermsRouter.delete(
  "/:id",
  requirePermission("finance.write"),
  validateRequest({ params: paymentTermIdParamSchema }),
  asyncHandler(financeController.deleteTerm)
);

export default paymentsRouter;
