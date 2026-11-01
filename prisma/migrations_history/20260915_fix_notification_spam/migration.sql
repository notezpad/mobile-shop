-- Migration v3: Fix the ~500x duplicate notification spam.
--
-- ROOT CAUSE (v2 bug):
--   The low_stock dedup check searched `title contains product_name`, but
--   the title was always the constant Arabic string "low stock" - it
--   NEVER contained the product name. So the dedup ALWAYS returned null,
--   and a new notification row was inserted on every 30s poll. After ~4h
--   that is ~480 duplicate rows per low-stock product.
--
-- THIS MIGRATION:
--   1. Adds an index on (tenantId, type) - speeds up the dedup query
--      (which now correctly searches by `message contains ...`).
--   2. Adds an index on (tenantId, type, message) - speeds up the
--      cleanupDuplicateNotifications grouping query.
--   3. Cleans up existing duplicate rows: for each (tenantId, type, message)
--      group, keep only the MOST RECENT row and delete the rest.
--      This nukes the ~460 legacy spam rows in one shot - no need to wait
--      for the runtime cleanup function to do it poll-by-poll.
--
-- All statements are idempotent (IF NOT EXISTS / CTE-based delete) - safe
-- to run multiple times.

-- 1. Add indexes for faster dedup + cleanup queries
CREATE INDEX IF NOT EXISTS "Notification_tenant_type_idx"
  ON "Notification"("tenantId", "type");

CREATE INDEX IF NOT EXISTS "Notification_tenant_type_message_idx"
  ON "Notification"("tenantId", "type", "message");

-- 2. Clean up existing duplicate notifications
-- For each (tenantId, type, message) group, keep only the row with the
-- MAX(id) - this is the most recent row because the table uses a SERIAL
-- auto-increment id. Delete all older duplicates.
DELETE FROM "Notification"
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "tenantId", type, message
        ORDER BY id DESC
      ) AS rn
    FROM "Notification"
  ) ranked
  WHERE ranked.rn > 1
);

-- 3. (Optional) VACUUM ANALYZE the table to reclaim space
-- This is safe to run; it just updates planner statistics. Skipped here
-- because it requires an ACCESS EXCLUSIVE lock and we do not want to block
-- the app. The user can run `VACUUM ANALYZE "Notification";` manually if
-- they want to reclaim disk space after the bulk delete.
