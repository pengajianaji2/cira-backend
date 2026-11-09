-- Preserve the prior task state in history before mapping the retired value.
INSERT INTO "activity_logs" ("id", "projectId", "category", "action", "description", "userName", "metadata", "createdAt")
SELECT gen_random_uuid()::text, t."projectId", 'task', 'STATUS_NORMALIZED',
       'Status task dimigrasikan dari in_progress menjadi todo.', 'Cira PM migration',
       jsonb_build_object('taskId', t."id", 'previousStatus', t."status", 'newStatus', 'todo'), NOW()
FROM "tasks" t
WHERE t."status" = 'in_progress';

UPDATE "tasks" SET "status" = 'todo' WHERE "status" = 'in_progress';

ALTER TABLE "projects" ADD CONSTRAINT "projects_status_allowed_check"
  CHECK ("status" IN ('lead', 'active', 'completed', 'cancelled')) NOT VALID;
ALTER TABLE "project_status_requests" ADD CONSTRAINT "project_status_requests_status_allowed_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected')) NOT VALID;
ALTER TABLE "project_status_requests" ADD CONSTRAINT "project_status_requests_final_decision_allowed_check"
  CHECK ("finalDecision" IS NULL OR "finalDecision" IN ('approved', 'rejected')) NOT VALID;
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_status_allowed_check"
  CHECK ("status" IN ('planning', 'active', 'completed')) NOT VALID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_allowed_check"
  CHECK ("status" IN ('todo', 'done')) NOT VALID;
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_allowed_check"
  CHECK ("status" IN ('pending', 'verified')) NOT VALID;
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_status_allowed_check"
  CHECK ("status" IN ('planned', 'ready', 'invoiced', 'paid')) NOT VALID;
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_trigger_type_allowed_check"
  CHECK ("triggerType" IN ('date', 'sprint', 'manual')) NOT VALID;
ALTER TABLE "operational_events" ADD CONSTRAINT "operational_events_status_allowed_check"
  CHECK ("status" IN ('scheduled', 'cancelled')) NOT VALID;
ALTER TABLE "operational_events" ADD CONSTRAINT "operational_events_type_allowed_check"
  CHECK ("eventType" IN ('client_demo', 'deployment', 'maintenance', 'meeting')) NOT VALID;

ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_status_allowed_check";
ALTER TABLE "project_status_requests" VALIDATE CONSTRAINT "project_status_requests_status_allowed_check";
ALTER TABLE "project_status_requests" VALIDATE CONSTRAINT "project_status_requests_final_decision_allowed_check";
ALTER TABLE "sprints" VALIDATE CONSTRAINT "sprints_status_allowed_check";
ALTER TABLE "tasks" VALIDATE CONSTRAINT "tasks_status_allowed_check";
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_status_allowed_check";
ALTER TABLE "payment_terms" VALIDATE CONSTRAINT "payment_terms_status_allowed_check";
ALTER TABLE "payment_terms" VALIDATE CONSTRAINT "payment_terms_trigger_type_allowed_check";
ALTER TABLE "operational_events" VALIDATE CONSTRAINT "operational_events_status_allowed_check";
ALTER TABLE "operational_events" VALIDATE CONSTRAINT "operational_events_type_allowed_check";
