-- 🏢 (v22) الموظفين المرتبطين بحساب دخول وليهم فرع على الحساب بس: ننسخ فرع الحساب لسجل الموظف
-- علشان ورديات الفرع تظهر في فورم الموظف و«ملفي». آمن: بيلمس بس الموظف اللي branchId عنده NULL.
UPDATE "Employee" e
SET "branchId" = u."branchId"
FROM "User" u
WHERE e."userId" = u."id"
  AND e."tenantId" = u."tenantId"
  AND e."branchId" IS NULL
  AND u."branchId" IS NOT NULL;
