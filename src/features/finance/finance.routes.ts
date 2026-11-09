import { Router } from "express";
import { requireAuth, requirePermission } from "../../shared/middlewares/auth.middleware.js";
import { requireProjectResourceAccess } from "../../shared/middlewares/projectAccess.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectIdParamSchema } from "../tasks/tasks.schema.js";
import { financeController } from "./finance.controller.js";
import {
  createPaymentSchema,
  issueInvoiceSchema,
  markTermReadySchema,
  paymentIdParamSchema,
  paymentTermIdParamSchema,
  updatePaymentSchema,
  updateTermSchema,
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
  requireProjectResourceAccess("payment"),
  asyncHandler(financeController.verifyPayment)
);

paymentsRouter.patch(
  "/:id",
  requirePermission("finance.write"),
  validateRequest({
    params: paymentIdParamSchema,
    body: updatePaymentSchema,
  }),
  requireProjectResourceAccess("payment"),
  asyncHandler(financeController.updatePayment)
);

paymentsRouter.delete(
  "/:id",
  requirePermission("finance.write"),
  validateRequest({ params: paymentIdParamSchema }),
  requireProjectResourceAccess("payment"),
  asyncHandler(financeController.deletePayment)
);

// =========================================================================
// US-3: Rute Termin & Penerbitan Invoice Manual (/api/v1/payment-terms/:id)
// =========================================================================
export const paymentTermsRouter = Router();
paymentTermsRouter.use(requireAuth);

paymentTermsRouter.get(
  "/:id",
  requirePermission("finance.read"),
  validateRequest({ params: paymentTermIdParamSchema }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.getTermById)
);

// AC-3.1 & BR-TERM-08: Perbarui detail/pemicu tunggal termin yang belum terkunci
paymentTermsRouter.patch(
  "/:id",
  requirePermission("finance.payment_terms.manage"),
  validateRequest({
    params: paymentTermIdParamSchema,
    body: updateTermSchema,
  }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.updateTerm)
);

// BR-TERM-05: Tandai termin siap ditagih (BAST opsional)
paymentTermsRouter.patch(
  "/:id/ready",
  requirePermission("finance.payment_terms.manage"),
  validateRequest({
    params: paymentTermIdParamSchema,
    body: markTermReadySchema,
  }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.markTermReadyWithBast)
);

// AC-3.3 & BR-TERM-07: Catat/terbitkan invoice resmi dengan invoiceDueDate wajib dan kunci termin
paymentTermsRouter.post(
  "/:id/invoice",
  requirePermission("finance.invoices.create"),
  validateRequest({
    params: paymentTermIdParamSchema,
    body: issueInvoiceSchema,
  }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.issueTermInvoice)
);

// AC-3.4 & BR-TERM-08: Tandai invoice termin telah lunas (invoiced -> paid)
paymentTermsRouter.patch(
  "/:id/pay",
  requirePermission("finance.invoices.create"),
  validateRequest({ params: paymentTermIdParamSchema }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.markTermPaid)
);

paymentTermsRouter.delete(
  "/:id",
  requirePermission("finance.payment_terms.manage"),
  validateRequest({ params: paymentTermIdParamSchema }),
  requireProjectResourceAccess("paymentTerm"),
  asyncHandler(financeController.deleteTerm)
);

export default paymentsRouter;
