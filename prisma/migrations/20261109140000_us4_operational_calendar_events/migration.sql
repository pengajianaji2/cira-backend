-- US-4: Menambahkan tabel operational_events (projectId nullable) beserta indeks & RBAC kalender operasional
CREATE TABLE IF NOT EXISTS "operational_events" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "description" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "allDayStartDate" TEXT,
  "allDayEndDate" TEXT,
  "projectId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "createdById" TEXT,
  "updatedById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancelReason" TEXT,
  "lastRemindedAt" TIMESTAMP(3),
  "lastRemindedById" TEXT,
  "reminderNote" TEXT,
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operational_events_projectId_fkey'
  ) THEN
    ALTER TABLE "operational_events"
      ADD CONSTRAINT "operational_events_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operational_events_createdById_fkey'
  ) THEN
    ALTER TABLE "operational_events"
      ADD CONSTRAINT "operational_events_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operational_events_updatedById_fkey'
  ) THEN
    ALTER TABLE "operational_events"
      ADD CONSTRAINT "operational_events_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "operational_events_status_startAt_idx"
  ON "operational_events"("status", "startAt");

CREATE INDEX IF NOT EXISTS "operational_events_status_allDay_allDayStartDate_idx"
  ON "operational_events"("status", "allDay", "allDayStartDate");

CREATE INDEX IF NOT EXISTS "operational_events_projectId_status_idx"
  ON "operational_events"("projectId", "status");

-- Sinkronkan permission US-4 pada role_policies: hanya Owner & Operasional (Developer dilarang)
UPDATE "role_policies"
SET "permissions" = ARRAY(
  SELECT DISTINCT perm
  FROM unnest("permissions" || ARRAY['operations.calendar.read', 'operations.events.manage']) AS perm
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "role" IN ('owner', 'operasional');
