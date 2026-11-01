-- 🔒 (v23) وردية مفتوحة واحدة بس لكل فرع على مستوى الداتابيز (حماية من الضغطتين المتزامنتين).
-- لو فيه تكرار قديم الـ index مش بيتعمل (بنكتفي بتنبيه) — اقفل المكرر يدوياً وأعد التشغيل.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ShiftSession" WHERE "closedAt" IS NULL
    GROUP BY "tenantId", COALESCE("branchId", 0) HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'ShiftSession: فيه أكتر من وردية مفتوحة لنفس الفرع — اقفل المكرر وبعدها اعمل الـ index';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "ShiftSession_one_open_per_branch"
      ON "ShiftSession" ("tenantId", COALESCE("branchId", 0)) WHERE "closedAt" IS NULL;
  END IF;
END $$;
