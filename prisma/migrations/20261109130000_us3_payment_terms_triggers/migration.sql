-- US-3: Menambahkan kolom pemicu termin (triggerDate, requiredCompletedSprints), readyAt, invoiceDueDate, dan paidAt secara backward-compatible
ALTER TABLE "payment_terms"
  ADD COLUMN IF NOT EXISTS "triggerDate" TEXT,
  ADD COLUMN IF NOT EXISTS "requiredCompletedSprints" INTEGER,
  ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceDueDate" TEXT,
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payment_terms_status_triggerType_triggerDate_idx"
  ON "payment_terms"("status", "triggerType", "triggerDate");

CREATE INDEX IF NOT EXISTS "payment_terms_status_invoiceDueDate_idx"
  ON "payment_terms"("status", "invoiceDueDate");

CREATE INDEX IF NOT EXISTS "payment_terms_status_readyAt_idx"
  ON "payment_terms"("status", "readyAt");

-- Sinkronkan permission baru US-3 pada role_policies untuk owner dan operasional (tanpa menghapus izin custom yang ada)
UPDATE "role_policies"
SET "permissions" = ARRAY(
  SELECT DISTINCT perm
  FROM unnest("permissions" || ARRAY['finance.payment_terms.manage', 'finance.invoices.create']) AS perm
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "role" IN ('owner', 'operasional');
