-- 🛡️ المرحلة 3 (2026-11-02) — حمايات التاريخ المالي والربط (خ-9 + مت-11)
--
-- خ-9: علاقات الموظف المالية كانت Cascade — حذف موظف صرفت عليه رواتب أو سلف
-- كان بيمسح قسائمه المدفوعة وسلفه، و PayrollRun.totalNet بيفضل برقم قديم
-- مايطابقش القسائم المتبقية، وقيود الخزنة refId='payroll' بتظل مؤشرات على
-- صفوف محذوفة. RESTRICT على Payslip وEmployeeAdvance: موظف له تاريخ مالي
-- مالوش يتنمسح أبدًا (نفس مبدأ العميل اللي عليه دين). الحذف في النظام
-- soft-delete أصلًا (active=false) — القيد حاجز أخير.
--
-- مت-11: ربط حساب الدخول (Employee.userId) بموظف واحد — التحقق كان بـ
-- findFirst قبل الكتابة فقط (نافذة سباق: طلبان متوازيان يربطان نفس الحساب
-- بموظفين فعمولة البائع تتضاف في قسيمتين). في PostgreSQL القيم NULL
-- المتعددة مسموحة في القيد الفريد فالموظف بدون حساب مش متأثر.
-- ملاحظة: قبل التشغيل لو فيه ربط مكرر حالي في الداتابيز، القيد هيفشل —
-- نضّفه الأول:
--   SELECT "tenantId", "userId", COUNT(*) FROM "Employee"
--   WHERE "userId" IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;

-- ── خ-9: Payslip.employeeId → ON DELETE RESTRICT ──
ALTER TABLE "Payslip" DROP CONSTRAINT IF EXISTS "Payslip_employeeId_fkey";
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── خ-9: EmployeeAdvance.employeeId → ON DELETE RESTRICT ──
ALTER TABLE "EmployeeAdvance" DROP CONSTRAINT IF EXISTS "EmployeeAdvance_employeeId_fkey";
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── مت-11: تفرد ربط حساب الدخول بالموظف (نفس اسم فهرس Prisma @@unique) ──
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_userId_key" ON "Employee"("userId");

-- ── خ-8: توثيق الفهرس التعبيري للاستيراد بالاسم ──
-- Prisma مش بيعبّر عن expression index في الـ schema DSL — الفهرس ده بيتعمل
-- بـ SQL مباشر (نفس نمط فهرس الباركود). IF NOT EXISTS = آمن على بيئة عملت
-- perf-indexes-v1.sql قبل كده، وبيتأنشى فعليًا على بيئة جديدة من الـ Baseline.
CREATE INDEX IF NOT EXISTS "Product_tenantId_lname_idx" ON "Product" ("tenantId", (lower(btrim("name"))));
