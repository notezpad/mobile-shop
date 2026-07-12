-- ============================================================================
-- Migration 0008 — Phase 8 (Returns)
--
-- Contents:
--  1. v_returns_list view — returns with customer + sale + branch names.
--  2. v_returns_with_details view — return + items with product info.
--  3. Indexes for faster return queries.
-- ============================================================================

-- ─── 1. v_returns_list view ───────────────────────────────────────
create or replace view public.v_returns_list as
select
  r.id,
  r.return_no,
  r.sale_id,
  r.branch_id,
  r.customer_id,
  r.reason,
  r.total,
  r.status,
  r.refund_method,
  r.approved_by,
  r.approved_at,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  b.name as branch_name,
  s.invoice_no as sale_invoice_no,
  u.full_name as approved_by_name
from public.returns r
left join public.customers c on c.id = r.customer_id and c.deleted_at is null
left join public.branches b on b.id = r.branch_id and b.deleted_at is null
left join public.sales s on s.id = r.sale_id and s.deleted_at is null
left join public.users u on u.id = r.approved_by and u.deleted_at is null
where r.deleted_at is null;

comment on view public.v_returns_list is
  'Returns list with customer, sale, branch, and approver names.';

grant select on public.v_returns_list to anon, authenticated;

-- ─── 2. v_returns_with_details view ───────────────────────────────
create or replace view public.v_returns_with_details as
select
  r.id,
  r.return_no,
  r.sale_id,
  r.branch_id,
  r.customer_id,
  r.reason,
  r.total,
  r.status,
  r.refund_method,
  r.approved_by,
  r.approved_at,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  b.name as branch_name,
  s.invoice_no as sale_invoice_no,
  u.full_name as approved_by_name,
  -- Items as JSON array
  (
    select coalesce(json_agg(json_build_object(
      'id', ri.id,
      'return_id', ri.return_id,
      'sale_item_id', ri.sale_item_id,
      'quantity', ri.quantity,
      'refund_amount', ri.refund_amount,
      'product_name', p.name,
      'product_sku', p.sku,
      'imei1', du.imei1
    )), '[]'::json)
    from public.return_items ri
    left join public.sale_items si on si.id = ri.sale_item_id
    left join public.products p on p.id = si.product_id
    left join public.device_units du on du.id = si.device_unit_id
    where ri.return_id = r.id and ri.deleted_at is null
  ) as items
from public.returns r
left join public.customers c on c.id = r.customer_id and c.deleted_at is null
left join public.branches b on b.id = r.branch_id and b.deleted_at is null
left join public.sales s on s.id = r.sale_id and s.deleted_at is null
left join public.users u on u.id = r.approved_by and u.deleted_at is null
where r.deleted_at is null;

comment on view public.v_returns_with_details is
  'Single return with items as JSON array + joined names.';

grant select on public.v_returns_with_details to anon, authenticated;

-- ─── 3. Indexes ───────────────────────────────────────────────────
create index if not exists idx_returns_return_no
  on public.returns (return_no)
  where deleted_at is null;

create index if not exists idx_returns_branch_date
  on public.returns (branch_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_returns_sale
  on public.returns (sale_id)
  where deleted_at is null;

create index if not exists idx_returns_customer
  on public.returns (customer_id, created_at desc)
  where deleted_at is null and customer_id is not null;

create index if not exists idx_returns_status
  on public.returns (status, created_at desc)
  where deleted_at is null;

create index if not exists idx_return_items_return
  on public.return_items (return_id)
  where deleted_at is null;

create index if not exists idx_return_items_sale_item
  on public.return_items (sale_item_id)
  where deleted_at is null;
