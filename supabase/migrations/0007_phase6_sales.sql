-- ============================================================================
-- Migration 0007 — Phase 6 (Sales / POS)
--
-- Contents:
--  1. v_sales_list view — sales with customer + cashier + branch names.
--  2. v_sales_with_details view — sale + items + payments + names.
--  3. Indexes for faster sale queries.
-- ============================================================================

-- ─── 1. v_sales_list view ─────────────────────────────────────────
create or replace view public.v_sales_list as
select
  s.id,
  s.invoice_no,
  s.branch_id,
  s.customer_id,
  s.cashier_id,
  s.status,
  s.subtotal,
  s.discount,
  s.tax,
  s.total,
  s.paid,
  s.change,
  s.payment_method,
  s.due_amount,
  s.notes,
  s.completed_at,
  s.created_at,
  s.updated_at,
  s.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  u.full_name as cashier_name,
  b.name as branch_name,
  b.code as branch_code,
  -- Items count
  (
    select count(*) from public.sale_items si
    where si.sale_id = s.id and si.deleted_at is null
  ) as items_count
from public.sales s
left join public.customers c on c.id = s.customer_id and c.deleted_at is null
left join public.users u on u.id = s.cashier_id and u.deleted_at is null
left join public.branches b on b.id = s.branch_id and b.deleted_at is null;

comment on view public.v_sales_list is
  'Sales list with customer, cashier, and branch names + items count.';

grant select on public.v_sales_list to anon, authenticated;

-- ─── 2. v_sales_with_details view ─────────────────────────────────
-- Single sale with all items + payments + names.
-- Note: This is a denormalized view for the API response. The worker
-- service fetches items + payments separately for the detail page.

create or replace view public.v_sales_with_details as
select
  s.id,
  s.invoice_no,
  s.branch_id,
  s.customer_id,
  s.cashier_id,
  s.status,
  s.subtotal,
  s.discount,
  s.discount_type,
  s.tax,
  s.total,
  s.paid,
  s.change,
  s.payment_method,
  s.due_amount,
  s.notes,
  s.completed_at,
  s.created_at,
  s.updated_at,
  s.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  u.full_name as cashier_name,
  b.name as branch_name,
  b.code as branch_code,
  -- Items as JSON array
  (
    select coalesce(json_agg(json_build_object(
      'id', si.id,
      'product_id', si.product_id,
      'device_unit_id', si.device_unit_id,
      'quantity', si.quantity,
      'unit_price', si.unit_price,
      'discount', si.discount,
      'tax_rate', si.tax_rate,
      'total', si.total,
      'product_name', p.name,
      'product_sku', p.sku,
      'imei1', du.imei1
    )), '[]'::json)
    from public.sale_items si
    left join public.products p on p.id = si.product_id
    left join public.device_units du on du.id = si.device_unit_id
    where si.sale_id = s.id and si.deleted_at is null
  ) as items,
  -- Payments as JSON array
  (
    select coalesce(json_agg(json_build_object(
      'id', ip.id,
      'method', ip.method,
      'amount', ip.amount,
      'reference', ip.reference,
      'paid_at', ip.paid_at
    )), '[]'::json)
    from public.invoice_payments ip
    inner join public.invoices inv on inv.id = ip.invoice_id and inv.deleted_at is null
    where inv.sale_id = s.id and ip.deleted_at is null
  ) as payments
from public.sales s
left join public.customers c on c.id = s.customer_id and c.deleted_at is null
left join public.users u on u.id = s.cashier_id and u.deleted_at is null
left join public.branches b on b.id = s.branch_id and b.deleted_at is null
where s.deleted_at is null;

comment on view public.v_sales_with_details is
  'Single sale with items + payments as JSON arrays + joined names.';

grant select on public.v_sales_with_details to anon, authenticated;

-- ─── 3. Indexes ───────────────────────────────────────────────────
create index if not exists idx_sales_invoice_no
  on public.sales (invoice_no)
  where deleted_at is null;

create index if not exists idx_sales_branch_date
  on public.sales (branch_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_sales_customer
  on public.sales (customer_id, created_at desc)
  where deleted_at is null and customer_id is not null;

create index if not exists idx_sales_cashier
  on public.sales (cashier_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_sales_status
  on public.sales (status, created_at desc)
  where deleted_at is null;

create index if not exists idx_sale_items_sale
  on public.sale_items (sale_id)
  where deleted_at is null;

create index if not exists idx_invoice_payments_invoice
  on public.invoice_payments (invoice_id)
  where deleted_at is null;

create index if not exists idx_device_units_sale
  on public.device_units (sale_id)
  where deleted_at is null and sale_id is not null;
