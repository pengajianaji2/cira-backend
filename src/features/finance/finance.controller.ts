import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { financeService } from "./finance.service.js";

export const financeController = {
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
