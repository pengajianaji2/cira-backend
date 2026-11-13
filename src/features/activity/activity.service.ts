import { NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { activityRepository } from "./activity.repository.js";
import { withResolvedUserAvatar } from "../files/fileSecurity.js";
import { policiesService } from "../auth/policies.service.js";
import { ActivityFilterQuery, CreateActivityDto } from "./activity.types.js";

export const activityService = {
  async getProjectActivities(
    projectId: string,
    filters: ActivityFilterQuery,
    user: AuthUserPayload
  ) {
    const project = await activityRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const includeFinance = await policiesService.hasAny(user.roles, "finance.read");
    return (await activityRepository.findByProjectId(projectId, { ...filters, includeFinance })).map((activity) => ({
      ...activity,
      user: withResolvedUserAvatar(activity.user),
    }));
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

    const created = await activityRepository.create(projectId, {
      ...dto,
      userId: user?.id,
      userName: user?.name,
      userRole: user?.roles?.[0],
    });
    return {
      ...created,
      user: withResolvedUserAvatar(created.user),
    };
  },
};
