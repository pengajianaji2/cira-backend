CREATE INDEX IF NOT EXISTS "projects_createdAt_idx" ON "projects"("createdAt");
CREATE INDEX IF NOT EXISTS "projects_status_createdAt_idx" ON "projects"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "tasks_projectId_status_order_idx" ON "tasks"("projectId", "status", "order");
CREATE INDEX IF NOT EXISTS "payments_projectId_createdAt_idx" ON "payments"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "payments_projectId_status_idx" ON "payments"("projectId", "status");
CREATE INDEX IF NOT EXISTS "design_assets_projectId_createdAt_idx" ON "design_assets"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_projectId_createdAt_idx" ON "activity_logs"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_projectId_category_createdAt_idx" ON "activity_logs"("projectId", "category", "createdAt");
