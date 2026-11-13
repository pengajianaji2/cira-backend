import { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/responseFormatter.js";
import { activityService } from "./activity.service.js";

export const activityController = {
  async getProjectActivities(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const activities = await activityService.getProjectActivities(
      projectId,
      res.locals.validatedQuery,
      req.user!
    );
    return sendSuccess(res, "Daftar riwayat aktivitas berhasil diambil", activities);
  },

  async logActivity(req: Request, res: Response): Promise<Response> {
    const projectId = req.params.projectId as string;
    const activity = await activityService.logActivity(
      projectId,
      req.body,
      req.user
    );
    return sendSuccess(res, "Aktivitas berhasil dicatat", activity, 201);
  },
};
