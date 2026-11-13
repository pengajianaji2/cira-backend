-- Protect existing installations from silently losing legacy file references or GZIP PRD history.
-- When any legacy file/document data exists, migrate it deliberately before applying this PRD migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "design_assets")
     OR EXISTS (SELECT 1 FROM "prd_versions")
     OR EXISTS (SELECT 1 FROM "projects" WHERE NULLIF("prdContent", '') IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "users" WHERE NULLIF("avatarUrl", '') IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "payments" WHERE NULLIF("proofUrl", '') IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "payment_terms" WHERE NULLIF("bastUrl", '') IS NOT NULL OR NULLIF("invoicePdfUrl", '') IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Legacy files or GZIP PRD history exist; export/migrate these records before applying the private Drive migration.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('AVATAR', 'DESIGN', 'PROOF', 'BAST', 'PRD', 'INVOICE');

-- DropForeignKey
ALTER TABLE "prd_versions" DROP CONSTRAINT "prd_versions_createdById_fkey";

-- DropForeignKey
ALTER TABLE "prd_versions" DROP CONSTRAINT "prd_versions_projectId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatarUrl",
ADD COLUMN     "avatarFileId" TEXT;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "prdContent",
ADD COLUMN     "deletionState" TEXT,
ADD COLUMN     "driveFolderId" TEXT;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "proofUrl",
ADD COLUMN     "proofFileId" TEXT;

-- AlterTable
ALTER TABLE "payment_terms" DROP COLUMN "bastUrl",
DROP COLUMN "invoicePdfUrl",
ADD COLUMN     "bastFileId" TEXT,
ADD COLUMN     "invoiceFileId" TEXT;

-- AlterTable
ALTER TABLE "design_assets" DROP COLUMN "storageReference",
ADD COLUMN     "fileId" TEXT NOT NULL;

-- DropTable
DROP TABLE "prd_versions";

-- CreateTable
CREATE TABLE "project_prd_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileId" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_prd_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "driveFileId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "category" "FileCategory" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectId" TEXT,
    "ownerUserId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "paymentId" TEXT,
    "termId" TEXT,
    "category" "FileCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "encryptedUri" TEXT,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'INITIALIZING',
    "resultFileId" TEXT,
    "description" TEXT,
    "originalSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_deletion_jobs" (
    "id" TEXT NOT NULL,
    "projectSnapshotId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "project_deletion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_deletion_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FILE',
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "project_deletion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_deletion_audits" (
    "id" TEXT NOT NULL,
    "projectSnapshotId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_deletion_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_prd_versions_fileId_key" ON "project_prd_versions"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "project_prd_versions_projectId_versionNumber_key" ON "project_prd_versions"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_driveFileId_key" ON "stored_files"("driveFileId");

-- CreateIndex
CREATE INDEX "stored_files_projectId_status_idx" ON "stored_files"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "file_upload_sessions_driveFileId_key" ON "file_upload_sessions"("driveFileId");

-- CreateIndex
CREATE INDEX "file_upload_sessions_status_expiresAt_idx" ON "file_upload_sessions"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_deletion_jobs_projectSnapshotId_key" ON "project_deletion_jobs"("projectSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "project_deletion_items_jobId_driveFileId_key" ON "project_deletion_items"("jobId", "driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatarFileId_key" ON "users"("avatarFileId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_proofFileId_key" ON "payments"("proofFileId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_bastFileId_key" ON "payment_terms"("bastFileId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_invoiceFileId_key" ON "payment_terms"("invoiceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "design_assets_fileId_key" ON "design_assets"("fileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_prd_versions" ADD CONSTRAINT "project_prd_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_prd_versions" ADD CONSTRAINT "project_prd_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_prd_versions" ADD CONSTRAINT "project_prd_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_bastFileId_fkey" FOREIGN KEY ("bastFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_sessions" ADD CONSTRAINT "file_upload_sessions_termId_fkey" FOREIGN KEY ("termId") REFERENCES "payment_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_deletion_items" ADD CONSTRAINT "project_deletion_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "project_deletion_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

