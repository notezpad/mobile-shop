-- 🏬 Phase 2: خزنة لكل فرع (idempotent)
-- CashEntry.branchId: NULL = قديم/غير مسند → بيتعامل كتابع للفرع الرئيسي (نفس قاعدة branch-scope.ts).
-- التحديد بيتم بـ trigger على الإدخال، فمفيش داعي نعدّل كل مكان بيكتب في الخزنة
-- (ولا دوال create_sale / create_purchase_order المنشورة على Supabase).

ALTER TABLE "CashEntry" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
CREATE INDEX IF NOT EXISTS "CashEntry_branchId_idx" ON "CashEntry"("branchId");
CREATE INDEX IF NOT EXISTS "CashEntry_tenantId_branchId_idx" ON "CashEntry"("tenantId", "branchId");
DO $$ BEGIN
  ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- فرع القيد = فرع السجل المصدر (فاتورة/أمر شراء/مصروف/صيانة)، وإلا فرع المستخدم اللي سجّله.
CREATE OR REPLACE FUNCTION cash_entry_resolve_branch(
  p_tenant text, p_source text, p_ref integer, p_user text
) RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE b integer := NULL;
BEGIN
  IF p_ref IS NOT NULL THEN
    IF p_source IN ('sale', 'return') THEN
      SELECT "branchId" INTO b FROM "Sale" WHERE "id" = p_ref AND "tenantId" = p_tenant;
    ELSIF p_source = 'payment' THEN
      SELECT s."branchId" INTO b FROM "SalePayment" sp JOIN "Sale" s ON s."id" = sp."saleId"
       WHERE sp."id" = p_ref AND s."tenantId" = p_tenant;
    ELSIF p_source IN ('purchase', 'purchase_refund') THEN
      SELECT "branchId" INTO b FROM "PurchaseOrder" WHERE "id" = p_ref AND "tenantId" = p_tenant;
    ELSIF p_source = 'expense' THEN
      SELECT "branchId" INTO b FROM "Expense" WHERE "id" = p_ref AND "tenantId" = p_tenant;
    ELSIF p_source = 'maintenance' THEN
      SELECT "branchId" INTO b FROM "MaintenanceOrder" WHERE "id" = p_ref AND "tenantId" = p_tenant;
    END IF;
  END IF;
  IF b IS NULL AND p_user IS NOT NULL THEN
    SELECT "branchId" INTO b FROM "User" WHERE "id" = p_user AND "tenantId" = p_tenant;
  END IF;
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION cash_entry_set_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."branchId" IS NULL THEN
    NEW."branchId" := cash_entry_resolve_branch(NEW."tenantId", NEW."source", NEW."refId", NEW."userId");
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "CashEntry_set_branch" ON "CashEntry";
CREATE TRIGGER "CashEntry_set_branch" BEFORE INSERT ON "CashEntry"
  FOR EACH ROW EXECUTE FUNCTION cash_entry_set_branch();

-- تعبئة القيود القديمة (مرة واحدة، آمنة لإعادة التشغيل)
UPDATE "CashEntry" c
   SET "branchId" = cash_entry_resolve_branch(c."tenantId", c."source", c."refId", c."userId")
 WHERE c."branchId" IS NULL;
