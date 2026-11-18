ALTER TABLE "sprints" DROP CONSTRAINT "sprints_status_allowed_check";

ALTER TABLE "sprints" ADD CONSTRAINT "sprints_status_allowed_check"
  CHECK ("status" IN ('planning', 'active', 'completed', 'deleted')) NOT VALID;

ALTER TABLE "sprints" VALIDATE CONSTRAINT "sprints_status_allowed_check";
