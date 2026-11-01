-- 🏬 الرواتب والسلف: القيد في الخزنة يتبع فرع الموظف (نفس فرع مصروف الراتب اللي بيتسجل أصلاً).
-- قبل كده كانت بتتسجل بفرع المستخدم اللي صرف، فلو المدير صرف الرواتب كانت كلها بتروح على الرئيسي.
-- بنوسّع دالة الـ trigger اللي اتعملت في 20261031_cash_branch (idempotent).

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
    ELSIF p_source = 'payroll' THEN
      -- refId = Payslip.id → فرع الموظف
      SELECT e."branchId" INTO b FROM "Payslip" ps JOIN "Employee" e ON e."id" = ps."employeeId"
       WHERE ps."id" = p_ref AND e."tenantId" = p_tenant;
    ELSIF p_source = 'advance' THEN
      -- refId = EmployeeAdvance.id → فرع الموظف
      SELECT e."branchId" INTO b FROM "EmployeeAdvance" a JOIN "Employee" e ON e."id" = a."employeeId"
       WHERE a."id" = p_ref AND e."tenantId" = p_tenant;
    END IF;
  END IF;
  IF b IS NULL AND p_user IS NOT NULL THEN
    SELECT "branchId" INTO b FROM "User" WHERE "id" = p_user AND "tenantId" = p_tenant;
  END IF;
  RETURN b;
END $$;

-- تصحيح القيود القديمة بتاعة الرواتب والسلف اللي اتسجلت على الرئيسي بالغلط (NULL)
UPDATE "CashEntry" c
   SET "branchId" = cash_entry_resolve_branch(c."tenantId", c."source", c."refId", c."userId")
 WHERE c."branchId" IS NULL AND c."source" IN ('payroll', 'advance');
