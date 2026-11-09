import { Router } from "express";
import { requireAuth, requirePermission, requirePermissionWhenPresent } from "../../shared/middlewares/auth.middleware.js";
import { requireProjectAccess } from "../../shared/middlewares/projectAccess.js";
import { validateRequest } from "../../shared/middlewares/validateRequest.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { projectActivitiesRouter } from "../activity/activity.routes.js";
import { projectAssetsRouter } from "../assets/assets.routes.js";
import { financeController } from "../finance/finance.controller.js";
import { projectPaymentsRouter } from "../finance/finance.routes.js";
import { createContractSchema } from "../finance/finance.schema.js";
import { projectSprintsRouter } from "../sprints/sprints.routes.js";
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
  projectListingQuerySchema,
  projectParamSchema,
  projectQuerySchema,
  updateProjectSchema,
} from "./projects.schema.js";

const router = Router();

// Seluruh route proyek membutuhkan autentikasi sesi
router.use(requireAuth);
router.use(requirePermission("projects.read"));

// Restrict nested project resources to assigned roster members, except organization-wide roles.
router.use("/:projectId/:nestedPath", requireProjectAccess("projectId"));

// Sub-rute untuk relasi proyek:
// 1. Kanban Tasks: /api/v1/projects/:projectId/tasks
router.use("/:projectId/tasks", projectTasksRouter);

// 1b. Sprints: /api/v1/projects/:projectId/sprints
router.use("/:projectId/sprints", projectSprintsRouter);

// 2. Termin Pembayaran: /api/v1/projects/:projectId/payments
router.use("/:projectId/payments", projectPaymentsRouter);

// 2b. Kontrak & Termin Pembayaran 100% (US-3: AC-3.1)
router.post(
  "/:projectId/contracts",
  requirePermission("finance.payment_terms.manage"),
  requirePermission("projects.contract.update"),
  validateRequest({ params: projectParamSchema, body: createContractSchema }),
  asyncHandler(financeController.createProjectContract)
);
router.get(
  "/:projectId/payment-terms",
  requirePermission("finance.read"),
  validateRequest({ params: projectParamSchema }),
  asyncHandler(financeController.getProjectTerms)
);

// 3. Ringkasan Keuangan: /api/v1/projects/:projectId/finance-summary
router.get(
  "/:projectId/finance-summary",
  requirePermission("finance.read"),
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
  requirePermission("roster.manage"),
  validateRequest({ params: projectParamSchema, body: addRosterMemberSchema }),
  asyncHandler(governanceController.addRosterMember)
);
router.delete(
  "/:projectId/roster/:userId",
  requirePermission("roster.manage"),
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
  requirePermission("status.request"),
  validateRequest({ params: projectParamSchema, body: createStatusRequestSchema }),
  asyncHandler(governanceController.createStatusRequest)
);
router.post(
  "/:projectId/status-requests",
  requirePermission("status.request"),
  validateRequest({ params: projectParamSchema, body: createStatusRequestSchema }),
  asyncHandler(governanceController.createStatusRequest)
);
router.post(
  "/:projectId/status-request/:reqId/vote",
  requirePermission("status.vote"),
  validateRequest({ params: statusRequestIdParamSchema, body: submitVoteSchema }),
  asyncHandler(governanceController.submitVote)
);
router.post(
  "/:projectId/status-requests/:reqId/vote",
  requirePermission("status.vote"),
  validateRequest({ params: statusRequestIdParamSchema, body: submitVoteSchema }),
  asyncHandler(governanceController.submitVote)
);
router.post(
  "/:projectId/status-request/:reqId/final-decision",
  requirePermission("projects.status.change"),
  validateRequest({ params: statusRequestIdParamSchema, body: ownerFinalDecisionSchema }),
  asyncHandler(governanceController.ownerFinalDecision)
);
router.post(
  "/:projectId/status-requests/:reqId/final-decision",
  requirePermission("projects.status.change"),
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
  requirePermission("repositories.write"),
  validateRequest({ params: projectParamSchema, body: createRepoLinkSchema }),
  asyncHandler(governanceController.createRepository)
);
router.patch(
  "/:projectId/repositories/:repoId",
  requirePermission("repositories.write"),
  validateRequest({ params: repoIdParamSchema, body: updateRepoLinkSchema }),
  asyncHandler(governanceController.updateRepository)
);
router.delete(
  "/:projectId/repositories/:repoId",
  requirePermission("repositories.write"),
  validateRequest({ params: repoIdParamSchema }),
  asyncHandler(governanceController.deleteRepository)
);
router.patch(
  "/:projectId/repo-type",
  requirePermission("repositories.write"),
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
  requirePermission("prd.write"),
  validateRequest({ params: projectParamSchema, body: savePrdVersionSchema }),
  asyncHandler(governanceController.savePrdVersion)
);
router.post(
  "/:projectId/prd/versions/:versionId/restore",
  requirePermission("prd.write"),
  validateRequest({ params: prdVersionIdParamSchema }),
  asyncHandler(governanceController.restorePrdVersion)
);

// ========================================================
// CRUD Proyek Utama
// ========================================================
router.post(
  "/",
  requirePermission("projects.create"),
  validateRequest({ body: createProjectSchema }),
  requirePermissionWhenPresent("projects.contract.update", "contractValue"),
  asyncHandler(projectsController.createProject)
);

router.patch(
  "/:projectId/contract-value",
  requirePermission("projects.contract.update"),
  validateRequest({ params: projectParamSchema, body: createContractSchema.pick({ contractValue: true }) }),
  asyncHandler(projectsController.updateContractValue),
);

router.get(
  "/listing",
  validateRequest({ query: projectListingQuerySchema }),
  asyncHandler(projectsController.getProjectPage)
);

router.get(
  "/",
  validateRequest({ query: projectQuerySchema }),
  asyncHandler(projectsController.getAllProjects)
);

router.get(
  "/:id",
  validateRequest({ params: projectIdParamSchema }),
  requireProjectAccess("id"),
  asyncHandler(projectsController.getProjectById)
);

router.patch(
  "/:id",
  requirePermission("projects.update"),
  validateRequest({
    params: projectIdParamSchema,
    body: updateProjectSchema,
  }),
  requireProjectAccess("id"),
  requirePermissionWhenPresent("prd.write", "prdContent"),
  asyncHandler(projectsController.updateProject)
);

export default router;
