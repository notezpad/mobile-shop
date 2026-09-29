-- MANUAL, OPTIONAL — review before running (NOT part of the automatic migrations).
--
-- Older versions booked a 'commission' till entry for every supplier payment and
-- every customer payment made by wallet / InstaPay. That was a bug: commission
-- belongs only to the "financial transactions" module (source 'transaction').
--
-- 1) PREVIEW what would be removed:
SELECT id, "tenantId", amount, method, note, "createdAt"
  FROM "CashEntry"
 WHERE source = 'commission'
   AND (note LIKE '%— supplier_payment #%' OR note LIKE '%— payment #%')
 ORDER BY "tenantId", id;

-- 2) Add a reversing entry per wrong commission (keeps history, fixes the balance):
-- INSERT INTO "CashEntry" ("tenantId", source, "refId", amount, method, note, "createdAt")
-- SELECT "tenantId", 'commission', "refId", -amount, method,
--        'تصحيح: عمولة مسجلة بالخطأ على دفعة (' || COALESCE(note,'') || ')', NOW()
--   FROM "CashEntry"
--  WHERE source = 'commission'
--    AND (note LIKE '%— supplier_payment #%' OR note LIKE '%— payment #%')
--    AND amount > 0;
-- (Skip payments that were already cancelled: their commission was already reversed
--  with a negative entry, so filter those out first if you run this.)
