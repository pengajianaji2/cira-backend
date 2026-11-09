import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { financeService } from "./finance.service.js";

export const financeController = {
  async createProjectContract(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const result = await financeService.createContract(projectId, req.body, req.user);
    return sendSuccess(res, "Kontrak dan termin pembayaran berhasil dikonfigurasi", result, 201);
  },

  async getProjectTerms(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const terms = await financeService.getProjectTerms(projectId);
    return sendSuccess(res, "Daftar termin pembayaran berhasil diambil", terms);
  },

  async getTermById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const term = await financeService.getTermById(id);
    return sendSuccess(res, "Detail termin pembayaran berhasil diambil", term);
  },

  async updateTerm(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const term = await financeService.updateTerm(id, req.body, req.user);
    return sendSuccess(res, "Termin pembayaran berhasil diperbarui", term);
  },

  async markTermReadyWithBast(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const term = await financeService.markTermReadyWithBast(id, req.body ?? {}, req.user);
    return sendSuccess(res, "Status termin berhasil diperbarui menjadi Siap ditagih.", term);
  },

  async issueTermInvoice(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const term = await financeService.issueTermInvoice(id, req.body, req.user);
    return sendSuccess(res, `Invoice resmi ${term.invoiceNumber} berhasil diterbitkan`, term);
  },

  async markTermPaid(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const term = await financeService.markTermPaid(id, req.user);
    return sendSuccess(res, "Termin pembayaran berhasil ditandai Lunas", term);
  },

  async deleteTerm(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const result = await financeService.deleteTerm(id, req.user);
    return sendSuccess(res, "Termin pembayaran berhasil dihapus", result);
  },

  // =========================================================================
  // Existing Payment Handlers
  // =========================================================================

  async getProjectPayments(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const payments = await financeService.getPaymentsByProjectId(projectId);
    return sendSuccess(res, "Daftar termin pembayaran berhasil diambil", payments);
  },

  async createProjectPayment(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const payment = await financeService.createPayment(
      projectId,
      req.body,
      req.user
    );
    return sendSuccess(res, "Termin pembayaran berhasil ditambahkan", payment, 201);
  },

  async verifyPayment(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const payment = await financeService.verifyPayment(
      id,
      req.body,
      req.user
    );
    return sendSuccess(res, "Status verifikasi pembayaran berhasil diperbarui", payment);
  },

  async updatePayment(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const payment = await financeService.updatePayment(
      id,
      req.body,
      req.user
    );
    return sendSuccess(res, "Termin pembayaran berhasil diperbarui", payment);
  },

  async deletePayment(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const payment = await financeService.deletePayment(id, req.user);
    return sendSuccess(res, "Termin pembayaran berhasil dihapus", payment);
  },

  async getFinanceSummary(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const summary = await financeService.getFinanceSummary(projectId);
    return sendSuccess(res, "Ringkasan keuangan proyek berhasil diambil", summary);
  },
};
