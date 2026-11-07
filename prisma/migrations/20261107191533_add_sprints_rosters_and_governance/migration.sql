-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "repoType" TEXT NOT NULL DEFAULT 'monorepo';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "sprintId" TEXT,
ADD COLUMN     "storyPoints" INTEGER;

-- CreateTable
CREATE TABLE "project_rosters" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInProject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_status_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT NOT NULL,
    "finalDecisionById" TEXT,
    "finalDecision" TEXT,
    "finalReason" TEXT,
    "finalDecisionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_status_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_status_votes" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_repository_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_repository_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prd_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "compressedContent" BYTEA NOT NULL,
    "charCount" INTEGER NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prd_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "triggerSprintId" TEXT,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "bastUrl" TEXT,
    "bastFileName" TEXT,
    "bastUploadedAt" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "invoiceIssuedAt" TIMESTAMP(3),
    "invoicePdfUrl" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_rosters_projectId_idx" ON "project_rosters"("projectId");

-- CreateIndex
CREATE INDEX "project_rosters_userId_idx" ON "project_rosters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_rosters_projectId_userId_key" ON "project_rosters"("projectId", "userId");

-- CreateIndex
CREATE INDEX "project_status_requests_projectId_status_idx" ON "project_status_requests"("projectId", "status");

-- CreateIndex
CREATE INDEX "project_status_requests_createdAt_idx" ON "project_status_requests"("createdAt");

-- CreateIndex
CREATE INDEX "project_status_votes_requestId_idx" ON "project_status_votes"("requestId");

-- CreateIndex
CREATE INDEX "project_status_votes_userId_idx" ON "project_status_votes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_status_votes_requestId_userId_key" ON "project_status_votes"("requestId", "userId");

-- CreateIndex
CREATE INDEX "project_repository_links_projectId_idx" ON "project_repository_links"("projectId");

-- CreateIndex
CREATE INDEX "prd_versions_projectId_versionNumber_idx" ON "prd_versions"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "prd_versions_createdAt_idx" ON "prd_versions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prd_versions_projectId_versionNumber_key" ON "prd_versions"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "sprints_projectId_status_idx" ON "sprints"("projectId", "status");

-- CreateIndex
CREATE INDEX "sprints_createdAt_idx" ON "sprints"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_invoiceNumber_key" ON "payment_terms"("invoiceNumber");

-- CreateIndex
CREATE INDEX "payment_terms_projectId_termNumber_idx" ON "payment_terms"("projectId", "termNumber");

-- CreateIndex
CREATE INDEX "payment_terms_projectId_status_idx" ON "payment_terms"("projectId", "status");

-- CreateIndex
CREATE INDEX "payment_terms_invoiceNumber_idx" ON "payment_terms"("invoiceNumber");

-- CreateIndex
CREATE INDEX "tasks_sprintId_idx" ON "tasks"("sprintId");

-- AddForeignKey
ALTER TABLE "project_rosters" ADD CONSTRAINT "project_rosters_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_rosters" ADD CONSTRAINT "project_rosters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_requests" ADD CONSTRAINT "project_status_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_requests" ADD CONSTRAINT "project_status_requests_finalDecisionById_fkey" FOREIGN KEY ("finalDecisionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_requests" ADD CONSTRAINT "project_status_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_votes" ADD CONSTRAINT "project_status_votes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "project_status_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_votes" ADD CONSTRAINT "project_status_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repository_links" ADD CONSTRAINT "project_repository_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prd_versions" ADD CONSTRAINT "prd_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prd_versions" ADD CONSTRAINT "prd_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_triggerSprintId_fkey" FOREIGN KEY ("triggerSprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
