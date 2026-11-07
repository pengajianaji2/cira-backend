import { Router } from "express";
import { requireAnyRole, requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectActivitiesRouter } from "../activity/activity.routes.js";
import { projectAssetsRouter } from "../assets/assets.routes.js";
import { financeController } from "../finance/finance.controller.js";
import { projectPaymentsRouter } from "../finance/finance.routes.js";
import { projectTasksRouter } from "../tasks/tasks.routes.js";
import { governanceController } from "./governance.controller.js";
import {
  addRosterMemberSchema,
  createRepoLinkSchema,
  createStatusRequestSchema,
  ownerFinalDecisionSchema,
  prdVersionIdParamSchema,
  repoIdParamSchema,
  rosterUserIdParamSchema,
  savePrdVersionSchema,
  statusRequestIdParamSchema,
  submitVoteSchema,
  updateRepoLinkSchema,
  updateRepoTypeSchema,
} from "./governance.schema.js";
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

// ========================================================
// US-2: Project Governance, Status Voting, Repositories, PRD
// ========================================================

// 6. Roster Proyek (Voting Roster)
router.get(
  "/:projectId/roster",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(governanceController.getRoster)
);
router.post(
  "/:projectId/roster",
  requireAnyRole("owner", "operasional"),
  validateRequest({ params: projectParamSchema, body: addRosterMemberSchema }),
  asyncHandler(governanceController.addRosterMember)
);
router.delete(
  "/:projectId/roster/:userId",
  requireAnyRole("owner", "operasional"),
  validateRequest({ params: rosterUserIdParamSchema }),
  asyncHandler(governanceController.removeRosterMember)
);

// 7. Pengajuan Perubahan Status & Konsensus Voting (AC-B2-1, AC-B2-2, AC-B2-3)
router.get(
  "/:projectId/status-requests",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(governanceController.listStatusRequests)
);
router.get(
  "/:projectId/status-request/active",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(governanceController.getActiveStatusRequest)
);
router.post(
  "/:projectId/status-request",
  validateRequest({ params: projectParamSchema, body: createStatusRequestSchema }),
  asyncHandler(governanceController.createStatusRequest)
);
router.post(
  "/:projectId/status-requests",
  validateRequest({ params: projectParamSchema, body: createStatusRequestSchema }),
  asyncHandler(governanceController.createStatusRequest)
);
router.post(
  "/:projectId/status-request/:reqId/vote",
  validateRequest({ params: statusRequestIdParamSchema, body: submitVoteSchema }),
  asyncHandler(governanceController.submitVote)
);
router.post(
  "/:projectId/status-requests/:reqId/vote",
  validateRequest({ params: statusRequestIdParamSchema, body: submitVoteSchema }),
  asyncHandler(governanceController.submitVote)
);
router.post(
  "/:projectId/status-request/:reqId/final-decision",
  requireAnyRole("owner"),
  validateRequest({ params: statusRequestIdParamSchema, body: ownerFinalDecisionSchema }),
  asyncHandler(governanceController.ownerFinalDecision)
);
router.post(
  "/:projectId/status-requests/:reqId/final-decision",
  requireAnyRole("owner"),
  validateRequest({ params: statusRequestIdParamSchema, body: ownerFinalDecisionSchema }),
  asyncHandler(governanceController.ownerFinalDecision)
);

// 8. Manajemen Tautan Repositori Berlabel (AC-B2-5)
router.get(
  "/:projectId/repositories",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(governanceController.listRepositories)
);
router.post(
  "/:projectId/repositories",
  requireAnyRole("owner", "developer"),
  validateRequest({ params: projectParamSchema, body: createRepoLinkSchema }),
  asyncHandler(governanceController.createRepository)
);
router.patch(
  "/:projectId/repositories/:repoId",
  requireAnyRole("owner", "developer"),
  validateRequest({ params: repoIdParamSchema, body: updateRepoLinkSchema }),
  asyncHandler(governanceController.updateRepository)
);
router.delete(
  "/:projectId/repositories/:repoId",
  requireAnyRole("owner", "developer"),
  validateRequest({ params: repoIdParamSchema }),
  asyncHandler(governanceController.deleteRepository)
);
router.patch(
  "/:projectId/repo-type",
  requireAnyRole("owner", "developer"),
  validateRequest({ params: projectParamSchema, body: updateRepoTypeSchema }),
  asyncHandler(governanceController.updateRepoType)
);

// 9. PRD Versioning & GZIP Compression (AC-B2-4)
router.get(
  "/:projectId/prd/versions",
  validateRequest({ params: projectParamSchema }),
  asyncHandler(governanceController.listPrdVersions)
);
router.get(
  "/:projectId/prd/versions/:versionId",
  validateRequest({ params: prdVersionIdParamSchema }),
  asyncHandler(governanceController.getPrdVersionById)
);
router.post(
  "/:projectId/prd/versions",
  validateRequest({ params: projectParamSchema, body: savePrdVersionSchema }),
  asyncHandler(governanceController.savePrdVersion)
);
router.post(
  "/:projectId/prd/versions/:versionId/restore",
  validateRequest({ params: prdVersionIdParamSchema }),
  asyncHandler(governanceController.restorePrdVersion)
);

// ========================================================
// CRUD Proyek Utama
// ========================================================
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
