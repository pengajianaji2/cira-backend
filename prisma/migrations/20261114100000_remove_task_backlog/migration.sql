BEGIN;

WITH projects_with_backlog AS (
  SELECT DISTINCT "projectId"
  FROM "tasks"
  WHERE "sprintId" IS NULL
), migrated_sprints AS (
  INSERT INTO "sprints" ("id", "projectId", "name", "goal", "status", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    "projectId",
    'Migrated Backlog',
    'Todo dipindahkan dari Backlog saat Backlog dihapus.',
    'planning',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM projects_with_backlog
  RETURNING "id", "projectId"
)
UPDATE "tasks" AS task
SET "sprintId" = sprint."id"
FROM migrated_sprints AS sprint
WHERE task."projectId" = sprint."projectId"
  AND task."sprintId" IS NULL;

ALTER TABLE "tasks" ALTER COLUMN "sprintId" SET NOT NULL;
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_sprintId_fkey";
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "sprints"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
