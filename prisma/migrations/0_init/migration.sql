-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userName" TEXT,
    "userRole" TEXT,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."design_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "compressedSize" INTEGER NOT NULL,
    "compressionRatio" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TEXT,
    "notes" TEXT,
    "proofUrl" TEXT,
    "proofFileName" TEXT,
    "proofUploadedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientContact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lead',
    "contractValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prdContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "order" INTEGER NOT NULL DEFAULT 0,
    "assigneeName" TEXT,
    "assigneeRole" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY['developer']::TEXT[],
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "instagram" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimaryOwner" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_projectId_category_createdAt_idx" ON "public"."activity_logs"("projectId" ASC, "category" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "activity_logs_projectId_createdAt_idx" ON "public"."activity_logs"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "design_assets_projectId_createdAt_idx" ON "public"."design_assets"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "payments_projectId_createdAt_idx" ON "public"."payments"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "payments_projectId_status_idx" ON "public"."payments"("projectId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "projects_createdAt_idx" ON "public"."projects"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "projects_status_createdAt_idx" ON "public"."projects"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "tasks_projectId_status_order_idx" ON "public"."tasks"("projectId" ASC, "status" ASC, "order" ASC);

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "public"."user_invitations"("email" ASC);

-- CreateIndex
CREATE INDEX "user_invitations_token_idx" ON "public"."user_invitations"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_key" ON "public"."user_invitations"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."design_assets" ADD CONSTRAINT "design_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_invitations" ADD CONSTRAINT "user_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
