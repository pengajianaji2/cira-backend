import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { operationsService } from "./operations.service.js";
import { CalendarQueryFilters } from "./operations.types.js";

export const operationsController = {
  async getOperationalCalendar(req: Request, res: Response): Promise<Response> {
    const filters = (res.locals.validatedQuery ?? {}) as CalendarQueryFilters;
    const feed = await operationsService.getOperationalCalendar(filters);
    return sendSuccess(res, "Kalender operasional berhasil dimuat.", feed);
  },

  async createOperationalEvent(req: Request, res: Response): Promise<Response> {
    const created = await operationsService.createOperationalEvent(req.body, req.user);
    return sendSuccess(res, "Agenda operasional berhasil ditambahkan.", created, 201);
  },

  async updateOperationalEvent(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const updated = await operationsService.updateOperationalEvent(id, req.body, req.user);
    return sendSuccess(res, "Agenda operasional berhasil diperbarui.", updated);
  },

  async cancelOperationalEvent(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const cancelled = await operationsService.cancelOperationalEvent(id, req.body, req.user);
    return sendSuccess(res, "Agenda operasional berhasil dibatalkan.", cancelled);
  },

  async recordReminder(req: Request, res: Response): Promise<Response> {
    const id = req.params.id as string;
    const recorded = await operationsService.recordOperationalEventReminder(
      id,
      req.body,
      req.user
    );
    return sendSuccess(
      res,
      "Tindak lanjut manual berhasil dicatat (tidak mengirim email/WhatsApp otomatis).",
      recorded
    );
  },
};
