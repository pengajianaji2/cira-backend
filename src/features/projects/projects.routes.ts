import { Router } from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectActivitiesRouter } from "../activity/activity.routes.js";
import { projectAssetsRouter } from "../assets/assets.routes.js";
import { financeController } from "../finance/finance.controller.js";
import { projectPaymentsRouter } from "../finance/finance.routes.js";
import { projectTasksRouter } from "../tasks/tasks.routes.js";
import { projectsController } from "./projects.controller.js";
import {
  createProjectSchema,
  projectIdParamSchema,
  projectParamSchema,
  projectQuerySchema,
  updateProjectSchema,
} from "./projects.schema.js";

const router = Router();

// Seluruh route proyek membutuhkan autentikasi sesi
router.use(requireAuth);

// Sub-rute untuk relasi proyek:
// 1. Kanban Tasks: /api/v1/projects/:projectId/tasks
router.use("/:projectId/tasks", projectTasksRouter);

// 2. Termin Pembayaran: /api/v1/projects/:projectId/payments
router.use("/:projectId/payments", projectPaymentsRouter);

// 3. Ringkasan Keuangan: /api/v1/projects/:projectId/finance-summary
router.get(
  "/:projectId/finance-summary",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(financeController.getFinanceSummary)
);

// 4. Riwayat Aktivitas & Audit: /api/v1/projects/:projectId/activities
router.use("/:projectId/activities", projectActivitiesRouter);

// 5. Galeri Aset Desain: /api/v1/projects/:projectId/assets
router.use("/:projectId/assets", projectAssetsRouter);

// CRUD Proyek Utama
router.post(
  "/",
  validateRequest({ body: createProjectSchema }),
  asyncHandler(projectsController.createProject)
);

router.get(
  "/",
  validateRequest({ query: projectQuerySchema }),
  asyncHandler(projectsController.getAllProjects)
);

router.get(
  "/:id",
  validateRequest({ params: projectIdParamSchema }),
  asyncHandler(projectsController.getProjectById)
);

router.patch(
  "/:id",
  validateRequest({
    params: projectIdParamSchema,
    body: updateProjectSchema,
  }),
  asyncHandler(projectsController.updateProject)
);

export default router;
