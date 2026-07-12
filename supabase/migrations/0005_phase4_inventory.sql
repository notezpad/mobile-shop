-- ============================================================================
-- Migration 0005 — Phase 4 (Inventory)
--
-- Contents:
--  1. v_inventory_stock_levels view — joins products + inventory_stocks.
--  2. Indexes for faster stock queries.
--  3. v_stock_movements_with_names view — for movement history UI.
-- ============================================================================

-- ─── 1. v_inventory_stock_levels view ─────────────────────────────
-- Provides denormalized stock levels with product info + low-stock flags.
-- Used by the worker's inventory.service.ts listStockLevels().

create or replace view public.v_inventory_stock_levels as
select
  s.id as stock_id,
  s.product_id,
  s.branch_id,
  s.quantity,
  s.reserved_quantity,
  (s.quantity - s.reserved_quantity) as available_quantity,
  s.min_quantity,
  s.max_quantity,
  s.updated_at,
  p.name as product_name,
  p.sku as product_sku,
  p.barcode as product_barcode,
  p.type as product_type,
  p.cost_price as product_cost_price,
  p.sale_price as product_sale_price,
  p.category_id,
  c.name as category_name,
  p.min_quantity as product_min_quantity,
  -- Low stock: available <= min_quantity
  ((s.quantity - s.reserved_quantity) <= s.min_quantity) as is_low_stock,
  -- Stock valuation
  (s.quantity * p.cost_price) as stock_value_cost,
  (s.quantity * p.sale_price) as stock_value_sale
from public.inventory_stocks s
inner join public.products p on p.id = s.product_id and p.deleted_at is null
left join public.categories c on c.id = p.category_id and c.deleted_at is null
where s.deleted_at is null;

comment on view public.v_inventory_stock_levels is
  'Denormalized stock levels with product info, low-stock flags, and valuation. Used by inventory service.';

-- Grant access (anon can SELECT — RBAC enforced in worker).
grant select on public.v_inventory_stock_levels to anon, authenticated;

-- ─── 2. Indexes ────────────────────────────────────────────────────
-- Already created in migration 0001, but add composite indexes for common queries.

create index if not exists idx_inventory_stocks_branch_product
  on public.inventory_stocks (branch_id, product_id)
  where deleted_at is null;

create index if not exists idx_stock_movements_product_branch_date
  on public.stock_movements (product_id, branch_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_stock_movements_ref
  on public.stock_movements (ref_type, ref_id)
  where deleted_at is null and ref_type is not null;

create index if not exists idx_stock_transfers_status
  on public.stock_transfers (status, created_at desc)
  where deleted_at is null;

create index if not exists idx_stock_transfers_branches
  on public.stock_transfers (from_branch_id, to_branch_id)
  where deleted_at is null;

-- ─── 3. v_stock_movements_with_names view ─────────────────────────
-- Movement history with product + branch + user names for display.

create or replace view public.v_stock_movements_with_names as
select
  m.id,
  m.product_id,
  m.branch_id,
  m.type,
  m.quantity,
  m.balance_after,
  m.reason,
  m.ref_type,
  m.ref_id,
  m.user_id,
  m.created_at,
  p.name as product_name,
  p.sku as product_sku,
  b.name as branch_name,
  u.full_name as user_name,
  u.username as user_username
from public.stock_movements m
left join public.products p on p.id = m.product_id and p.deleted_at is null
left join public.branches b on b.id = m.branch_id and b.deleted_at is null
left join public.users u on u.id = m.user_id and u.deleted_at is null
where m.deleted_at is null;

comment on view public.v_stock_movements_with_names is
  'Movement history with joined product, branch, and user names for display in UI.';

grant select on public.v_stock_movements_with_names to anon, authenticated;

-- ─── 4. v_stock_transfers_summary view ────────────────────────────
create or replace view public.v_stock_transfers_summary as
select
  t.id,
  t.from_branch_id,
  t.to_branch_id,
  t.status,
  t.total_items,
  t.notes,
  t.shipped_at,
  t.received_at,
  t.created_at,
  fb.name as from_branch_name,
  tb.name as to_branch_name,
  u.full_name as user_name,
  (
    select count(*) from public.stock_transfer_items i
    where i.transfer_id = t.id and i.deleted_at is null
      and i.received_quantity < i.quantity
  ) as pending_items_count
from public.stock_transfers t
left join public.branches fb on fb.id = t.from_branch_id and fb.deleted_at is null
left join public.branches tb on tb.id = t.to_branch_id and tb.deleted_at is null
left join public.users u on u.id = t.user_id and u.deleted_at is null
where t.deleted_at is null;

comment on view public.v_stock_transfers_summary is
  'Stock transfer summary with branch names and pending item count.';

grant select on public.v_stock_transfers_summary to anon, authenticated;
