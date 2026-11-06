import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { activityRepository } from "./activity.repository.js";
import { ActivityFilterQuery, CreateActivityDto } from "./activity.types.js";

export const activityService = {
  async getProjectActivities(
    projectId: string,
    filters: ActivityFilterQuery
  ) {
    const project = await activityRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    return activityRepository.findByProjectId(projectId, filters);
  },

  async logActivity(
    projectId: string,
    dto: CreateActivityDto,
    user?: AuthUserPayload
  ) {
    const project = await activityRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    return activityRepository.create(projectId, {
      ...dto,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
    });
  },
};
