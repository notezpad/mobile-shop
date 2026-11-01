-- Drop the manual wholesaleEnabled toggle on Tenant.
--
-- Wholesale units are now gated purely by the tenant's PLAN capability
-- (`multi_unit`, only on electronics-pro / fashion-pro). There's no more
-- self-service on/off switch: if a tenant's plan has `multi_unit`, wholesale
-- units are always visible and usable; if not, they're always hidden. This
-- removes the loophole where a basic-tier tenant could flip this column on
-- themselves and see auto-created wholesale units without upgrading.
--
-- `retailEnabled` is untouched — it's an unrelated, not-yet-built "coming
-- soon" toggle for hiding the retail price column.
ALTER TABLE "Tenant"
  DROP COLUMN IF EXISTS "wholesaleEnabled";
