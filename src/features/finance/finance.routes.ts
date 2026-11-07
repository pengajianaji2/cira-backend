import { Router } from "express";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
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
projectPaymentsRouter.use(requireAnyRole("owner", "operasional", "ops"));

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
paymentsRouter.use(requireAnyRole("owner", "operasional", "ops"));

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

// =========================================================================
// US-4: Rute Langsung Termin & Penerbitan Invoice (/api/v1/payment-terms/:id)
// =========================================================================
export const paymentTermsRouter = Router();
paymentTermsRouter.use(requireAuth);
paymentTermsRouter.use(requireAnyRole("owner", "operasional", "ops"));

paymentTermsRouter.get(
  "/:id",
  validateRequest({ params: paymentTermIdParamSchema }),
  asyncHandler(financeController.getTermById)
);

// AC-14: Upload BAST dan tandai status siap ditagih (ready)
paymentTermsRouter.patch(
  "/:id/ready",
  validateRequest({
    params: paymentTermIdParamSchema,
    body: uploadBastSchema,
  }),
  asyncHandler(financeController.markTermReadyWithBast)
);

// AC-15: Terbitkan invoice resmi bernomor unik INV-YYYY-NNN/Tn dan kunci termin
paymentTermsRouter.post(
  "/:id/invoice",
  validateRequest({
    params: paymentTermIdParamSchema,
    body: issueInvoiceSchema,
  }),
  asyncHandler(financeController.issueTermInvoice)
);

paymentTermsRouter.delete(
  "/:id",
  validateRequest({ params: paymentTermIdParamSchema }),
  asyncHandler(financeController.deleteTerm)
);

export default paymentsRouter;
