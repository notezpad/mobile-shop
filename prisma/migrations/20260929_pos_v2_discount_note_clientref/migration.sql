-- POS v2: invoice discount + note + idempotency key.
-- Purely additive: every new column is nullable or has a default, so existing
-- rows, reports, returns and the cash drawer behave exactly as before.
-- (Payment methods need no schema change: CashEntry.method already exists.)
ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "subtotal"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discount"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "note"      TEXT,
  ADD COLUMN IF NOT EXISTS "clientRef" TEXT;

-- One invoice per (tenant, clientRef). NULLs are distinct in Postgres, so
-- old clients / legacy rows without a clientRef are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_tenantId_clientRef_key"
  ON "Sale" ("tenantId", "clientRef");
