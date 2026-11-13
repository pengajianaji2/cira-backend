import { Router } from "express";
import authRoutes from "../features/auth/auth.routes.js";
import usersRoutes from "../features/users/users.routes.js";
import projectRoutes from "../features/projects/projects.routes.js";
import tasksRouter from "../features/tasks/tasks.routes.js";
import sprintsRouter from "../features/sprints/sprints.routes.js";
import paymentsRouter, { paymentTermsRouter } from "../features/finance/finance.routes.js";
import assetsRouter from "../features/assets/assets.routes.js";
import policiesRouter from "../features/auth/policies.routes.js";
import operationsRouter from "../features/operations/operations.routes.js";
import filesRouter from "../features/files/files.routes.js";
import { prisma } from "../config/db.config.js";

/**
 * Agregator utama seluruh route REST API `/api/v1` (auth, policies, users, projects,
 * tasks, sprints, payments, payment-terms, assets, operations) serta endpoint liveness/readiness.
 */
const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/policies", policiesRouter);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/projects", projectRoutes);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/sprints", sprintsRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/payment-terms", paymentTermsRouter);
apiRouter.use("/assets", assetsRouter);
apiRouter.use("/operations", operationsRouter);
apiRouter.use("/files", filesRouter);

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cira-pm-backend",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`SELECT "keyHash" FROM "auth_rate_limits" LIMIT 0`;
    return res.status(200).json({ status: "ready", service: "cira-pm-backend" });
  } catch {
    return res.status(503).json({ status: "not_ready", service: "cira-pm-backend" });
  }
});

export default apiRouter;
