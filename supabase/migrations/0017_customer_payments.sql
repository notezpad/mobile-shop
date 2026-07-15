-- ============================================================================
-- Migration 0017 — Customer Payments (Running Tab / Account Settlement)
--
-- Purpose:
--   Allow customers to pay installments on their outstanding balance.
--   Each payment:
--    1. Records the payment (amount, method, date, reference, notes).
--    2. Reduces customer.balance.
--    3. Adds money to the user's open cashbox (if method is cash-based).
--    4. Appears in the customer's transaction history.
--
-- Design:
--   - Reuses existing `cashbox_transactions` for cash flow tracking.
--   - Reuses existing `payment_methods` enum: cash, vodafone_cash, instapay, etc.
--   - Branches: payment is attributed to the actor's branch (via cashbox.branch_id).
--   - This is a "running tab" model — payment reduces total balance, not a
--     specific invoice. Customers can keep buying and paying freely.
-- ============================================================================

-- ─── 1. customer_payments table ──────────────────────────────────
create table if not exists public.customer_payments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id),
  branch_id       uuid not null references public.branches(id),
  user_id         uuid not null references public.users(id),
  cashbox_id      uuid references public.cashboxes(id), -- null if no open cashbox

  amount          numeric(14, 2) not null check (amount > 0),
  payment_method  text not null default 'cash', -- cash, vodafone_cash, instapay, etc.
  reference       text,                          -- transaction ref (e.g. Vodafone transfer ID)
  paid_at         timestamptz not null default now(),
  notes           text,

  -- Standard audit + soft-delete + multi-tenant fields
  tenant_id       uuid references public.tenants(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  created_by      uuid references public.users(id),
  updated_by      uuid references public.users(id),
  revision        integer not null default 1,
  sync_status     text not null default 'synced'
);

comment on table public.customer_payments is
  'Customer installment/settlement payments. Each row reduces the customer''s balance and (if cash-based) adds to the cashbox.';

-- Indexes for fast lookup
create index if not exists idx_customer_payments_customer
  on public.customer_payments (customer_id);
create index if not exists idx_customer_payments_branch
  on public.customer_payments (branch_id);
create index if not exists idx_customer_payments_cashbox
  on public.customer_payments (cashbox_id);
create index if not exists idx_customer_payments_paid_at
  on public.customer_payments (paid_at desc);
create index if not exists idx_customer_payments_tenant
  on public.customer_payments (tenant_id);

-- ─── 2. RLS policies (mirror customers table) ────────────────────
alter table public.customer_payments enable row level security;

-- Tenants can only see their own payments
create policy "tenant_isolation_customer_payments_select"
  on public.customer_payments for select
  using (
    tenant_id = (select id from public.tenants where owner_user_id = auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.tenant_id = customer_payments.tenant_id
    )
  );

create policy "tenant_isolation_customer_payments_insert"
  on public.customer_payments for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.tenant_id = customer_payments.tenant_id
    )
  );

create policy "tenant_isolation_customer_payments_update"
  on public.customer_payments for update
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.tenant_id = customer_payments.tenant_id
    )
  );

-- ─── 3. Update v_customer_transactions view ──────────────────────
-- Add customer_payments to the unified transaction timeline so they
-- appear alongside sales/returns/repairs.
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

-- Customer payments (customer credited — reduces balance)
select
  cp.id,
  cp.customer_id,
  'payment' as type,
  'customer_payment' as ref_type,
  cp.id as ref_id,
  ('دفعة: ' || coalesce(cp.reference, cp.payment_method)) as description,
  -cp.amount as amount,
  null::numeric as balance_after,
  cp.paid_at as created_at,
  cp.reference as ref_number
from public.customer_payments cp
where cp.deleted_at is null

union all

-- Manual adjustments (legacy — recorded in audit_logs)
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
  'Unified customer transaction timeline: sales, returns, repairs, customer payments, and manual adjustments.';

grant select on public.v_customer_transactions to anon, authenticated;
grant select, insert, update on public.customer_payments to anon, authenticated;
