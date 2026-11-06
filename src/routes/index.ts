import { Router } from "express";
import authRoutes from "../features/auth/auth.routes.js";
import projectRoutes from "../features/projects/projects.routes.js";
import tasksRouter from "../features/tasks/tasks.routes.js";
import paymentsRouter from "../features/finance/finance.routes.js";
import assetsRouter from "../features/assets/assets.routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/projects", projectRoutes);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/assets", assetsRouter);

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cira-pm-backend",
    timestamp: new Date().toISOString(),
  });
});

export default apiRouter;
