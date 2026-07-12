-- ============================================================================
-- Migration 0006 — Phase 5 (Customers & Suppliers)
--
-- Contents:
--  1. v_customer_transactions view — unified transaction history.
--  2. v_customers_summary view — customer stats with last activity dates.
--  3. v_suppliers_summary view — supplier stats.
--  4. Indexes for faster customer/supplier queries.
-- ============================================================================

-- ─── 1. v_customer_transactions view ──────────────────────────────
-- Unifies transactions from sales, returns, repairs, and manual adjustments
-- into a single timeline per customer.
--
-- Amount sign convention:
--  positive = customer owes more (sale, repair charge, debit adjustment)
--  negative = customer paid/credited (payment, return refund, credit adjustment)

create or replace view public.v_customer_transactions as
-- Sales (customer owes total)
select
  gen_random_uuid() as id,
  s.customer_id,
  'sale' as type,
  'sale' as ref_type,
  s.id as ref_id,
  ('فاتورة بيع: ' || s.invoice_no) as description,
  s.total as amount,
  null::numeric as balance_after,
  s.created_at,
  s.invoice_no as ref_number
from public.sales s
where s.deleted_at is null and s.customer_id is not null and s.status = 'completed'

union all

-- Returns (customer credited)
select
  gen_random_uuid() as id,
  r.customer_id,
  'return' as type,
  'return' as ref_type,
  r.id as ref_id,
  ('مرتجع: ' || r.return_no) as description,
  -r.total as amount,
  null::numeric as balance_after,
  r.created_at,
  r.return_no as ref_number
from public.returns r
where r.deleted_at is null and r.customer_id is not null and r.status = 'completed'

union all

-- Repairs (customer owes total)
select
  gen_random_uuid() as id,
  rep.customer_id,
  'repair' as type,
  'repair' as ref_type,
  rep.id as ref_id,
  ('صيانة: ' || rep.ticket_no) as description,
  rep.total as amount,
  null::numeric as balance_after,
  rep.created_at,
  rep.ticket_no as ref_number
from public.repairs rep
where rep.deleted_at is null and rep.customer_id is not null
  and rep.status in ('delivered', 'ready')

union all

-- Manual adjustments (recorded in audit_logs as balance adjustments)
-- This is a simplified view — in production we'd have a dedicated table.
-- For now, we derive from audit_logs where entity='customers' and after has 'adjustment'.
select
  al.id,
  al.entity_id as customer_id,
  'adjustment' as type,
  'manual' as ref_type,
  al.id as ref_id,
  ('تسوية يدوية: ' || coalesce((al.after->>'reason')::text, '')) as description,
  ((al.after->>'adjustment')::numeric) as amount,
  null::numeric as balance_after,
  al.created_at,
  null as ref_number
from public.audit_logs al
where al.deleted_at is null
  and al.entity = 'customers'
  and al.action = 'update'
  and al.after ? 'adjustment';

comment on view public.v_customer_transactions is
  'Unified customer transaction timeline from sales, returns, repairs, and manual adjustments.';

grant select on public.v_customer_transactions to anon, authenticated;

-- ─── 2. v_customers_summary view ──────────────────────────────────
create or replace view public.v_customers_summary as
select
  c.id,
  c.name,
  c.code,
  c.phone,
  c.email,
  c.balance,
  c.credit_limit,
  c.total_purchases,
  c.total_repairs,
  c.is_active,
  c.created_at,
  -- Last sale date
  (
    select max(s.created_at)
    from public.sales s
    where s.customer_id = c.id and s.deleted_at is null and s.status = 'completed'
  ) as last_sale_at,
  -- Last repair date
  (
    select max(rep.created_at)
    from public.repairs rep
    where rep.customer_id = c.id and rep.deleted_at is null
  ) as last_repair_at,
  -- Total sales count
  (
    select count(*)
    from public.sales s
    where s.customer_id = c.id and s.deleted_at is null and s.status = 'completed'
  ) as sales_count,
  -- Total repairs count
  (
    select count(*)
    from public.repairs rep
    where rep.customer_id = c.id and rep.deleted_at is null
  ) as repairs_count
from public.customers c
where c.deleted_at is null;

comment on view public.v_customers_summary is
  'Customer summary with last activity dates and transaction counts.';

grant select on public.v_customers_summary to anon, authenticated;

-- ─── 3. v_suppliers_summary view ──────────────────────────────────
create or replace view public.v_suppliers_summary as
select
  s.id,
  s.name,
  s.code,
  s.phone,
  s.email,
  s.balance,
  s.is_active,
  s.created_at,
  s.notes
from public.suppliers s
where s.deleted_at is null;

comment on view public.v_suppliers_summary is
  'Supplier summary.';

grant select on public.v_suppliers_summary to anon, authenticated;

-- ─── 4. Indexes ───────────────────────────────────────────────────
create index if not exists idx_customers_phone
  on public.customers (phone)
  where deleted_at is null and phone is not null;

create index if not exists idx_customers_code
  on public.customers (code)
  where deleted_at is null and code is not null;

create index if not exists idx_customers_balance
  on public.customers (balance)
  where deleted_at is null and balance <> 0;

create index if not exists idx_suppliers_code
  on public.suppliers (code)
  where deleted_at is null;

create index if not exists idx_suppliers_balance
  on public.suppliers (balance)
  where deleted_at is null and balance <> 0;

create index if not exists idx_sales_customer
  on public.sales (customer_id, created_at desc)
  where deleted_at is null and customer_id is not null;

create index if not exists idx_repairs_customer
  on public.repairs (customer_id, created_at desc)
  where deleted_at is null;
