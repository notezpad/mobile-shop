-- ============================================================================
-- Migration 0003 — Phase 2 (Settings & Branches)
--
-- Contents:
--  1. Create 'public-assets' storage bucket for branch logos & product images.
--  2. Seed default global settings from DEFAULT_SETTINGS in @mobile-shop/shared.
--  3. Add an index on settings (key, branch_id) for faster lookups.
-- ============================================================================

-- ─── 1. Storage bucket ─────────────────────────────────────────────
-- Public read (logos/images need to load in <img> tags), authenticated write.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Bucket policies:
--  - Public read: anyone can read.
--  - Authenticated write: only logged-in users can upload.
drop policy if exists "public-assets-public-read" on storage.objects;
create policy "public-assets-public-read"
  on storage.objects for select
  using (bucket_id = 'public-assets');

drop policy if exists "public-assets-auth-write" on storage.objects;
create policy "public-assets-auth-write"
  on storage.objects for insert
  with check (bucket_id = 'public-assets' and auth.role() = 'authenticated');

drop policy if exists "public-assets-auth-update" on storage.objects;
create policy "public-assets-auth-update"
  on storage.objects for update
  using (bucket_id = 'public-assets' and auth.role() = 'authenticated');

drop policy if exists "public-assets-auth-delete" on storage.objects;
create policy "public-assets-auth-delete"
  on storage.objects for delete
  using (bucket_id = 'public-assets' and auth.role() = 'authenticated');

-- ─── 2. Seed default settings ──────────────────────────────────────
-- Mirrors DEFAULT_SETTINGS from packages/shared/src/schemas/setting.ts

insert into public.settings (id, key, value, category, branch_id)
select gen_random_uuid(), k, v, cat, null
from (values
  -- general
  ('general.app_name', '"Mobile Shop ERP"', 'general'),
  ('general.default_language', '"ar"', 'general'),
  ('general.timezone', '"Africa/Cairo"', 'general'),
  -- finance
  ('finance.default_currency', '"EGP"', 'finance'),
  ('finance.default_tax_rate', '14', 'finance'),
  ('finance.enable_multi_tax', 'false', 'finance'),
  ('finance.enabled_payment_methods',
    '["cash","card","vodafone_cash","instapay","fawry"]'::jsonb, 'finance'),
  -- receipt
  ('receipt.invoice_template', '"standard_a4"', 'receipt'),
  ('receipt.show_qr_on_invoice', 'true', 'receipt'),
  ('receipt.show_barcode_on_invoice', 'false', 'receipt'),
  -- notifications
  ('notifications.low_stock_alert', 'true', 'notifications'),
  ('notifications.repair_status_alert', 'true', 'notifications'),
  -- sync
  ('sync.interval_ms', '30000', 'sync'),
  ('sync.conflict_strategy', '"last_write_wins"', 'sync'),
  -- security
  ('security.password_min_length', '8', 'security'),
  ('security.session_timeout_min', '15', 'security'),
  ('security.require_pin', 'false', 'security')
) as t(k, v, cat)
where not exists (
  select 1 from public.settings s
  where s.key = t.k and s.branch_id is null and s.deleted_at is null
);

-- ─── 3. Indexes for faster lookups ─────────────────────────────────
create index if not exists idx_settings_key_branch
  on public.settings (key, branch_id)
  where deleted_at is null;

create index if not exists idx_settings_category
  on public.settings (category)
  where deleted_at is null;

-- ─── 4. View: branches summary ────────────────────────────────────
create or replace view public.v_branches_summary as
select
  b.id,
  b.name,
  b.code,
  b.is_main,
  b.is_active,
  b.phone,
  b.email,
  (select count(*) from public.users u
    where u.branch_id = b.id and u.deleted_at is null and u.status = 'active') as active_users_count,
  (b.settings->>'taxRate')::numeric as tax_rate,
  (b.settings->>'currency')::text as currency
from public.branches b
where b.deleted_at is null
order by b.is_main desc, b.name;

comment on view public.v_branches_summary is
  'Branch summary with active user count and key settings — used in admin UI.';
