-- Prevent hard deletion of a project from cascading into its audit/PRD history.
ALTER TABLE "activity_logs"
  DROP CONSTRAINT "activity_logs_projectId_fkey",
  ADD CONSTRAINT "activity_logs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prd_versions"
  DROP CONSTRAINT "prd_versions_projectId_fkey",
  ADD CONSTRAINT "prd_versions_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
