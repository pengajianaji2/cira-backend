ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects" ALTER COLUMN "contractValue" TYPE DECIMAL(20,2) USING ROUND("contractValue"::numeric, 2);
ALTER TABLE "payments" ALTER COLUMN "amount" TYPE DECIMAL(20,2) USING ROUND("amount"::numeric, 2);
ALTER TABLE "payment_terms" ALTER COLUMN "amount" TYPE DECIMAL(20,2) USING ROUND("amount"::numeric, 2);

CREATE TABLE "role_policies" (
  "role" TEXT NOT NULL,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  CONSTRAINT "role_policies_pkey" PRIMARY KEY ("role")
);

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_expiresAt_idx" ON "password_reset_tokens"("userId", "expiresAt");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "auth_rate_limits" (
  "keyHash" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("keyHash")
);
CREATE INDEX "auth_rate_limits_resetAt_idx" ON "auth_rate_limits"("resetAt");

CREATE TABLE "role_policy_history" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "addedPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "removedPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actorId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_policy_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "role_policy_history_role_createdAt_idx" ON "role_policy_history"("role", "createdAt");


INSERT INTO "role_policies" ("role", "permissions", "updatedAt") VALUES
('owner', ARRAY['projects.read','projects.create','projects.update','projects.status.change','projects.contract.update','finance.read','finance.write','tasks.write','tasks.delete','sprints.write','sprints.delete','roster.manage','status.request','status.vote','repositories.write','prd.write','assets.write','activities.read','directory.read','users.invite','users.manage','policies.manage'], CURRENT_TIMESTAMP),
('developer', ARRAY['projects.read','projects.create','projects.update','tasks.write','sprints.write','repositories.write','prd.write','assets.write','activities.read','directory.read','status.request','status.vote'], CURRENT_TIMESTAMP),
('operasional', ARRAY['projects.read','finance.read','finance.write','projects.contract.update','tasks.write','sprints.write','roster.manage','status.request','status.vote','assets.write','activities.read','directory.read'], CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
