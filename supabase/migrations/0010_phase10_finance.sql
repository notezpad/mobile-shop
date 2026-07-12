-- ============================================================================
-- Migration 0010 — Phase 10 (Finance)
--
-- Contents:
--  1. v_expenses_list view — expenses with category + user + branch names.
--  2. v_revenues_list view — revenues with category + user + branch names.
--  3. v_cashbox_summary view — cashbox with computed totals.
--  4. Indexes for faster finance queries.
-- ============================================================================

-- ─── 1. v_expenses_list view ──────────────────────────────────────
create or replace view public.v_expenses_list as
select
  e.id,
  e.branch_id,
  e.category_id,
  e.amount,
  e.payment_method,
  e.date,
  e.note,
  e.user_id,
  e.cashbox_id,
  e.created_at,
  e.updated_at,
  e.deleted_at,
  c.name as category_name,
  c.icon as category_icon,
  u.full_name as user_name,
  b.name as branch_name
from public.expenses e
left join public.expense_categories c on c.id = e.category_id and c.deleted_at is null
left join public.users u on u.id = e.user_id and u.deleted_at is null
left join public.branches b on b.id = e.branch_id and b.deleted_at is null
where e.deleted_at is null;

comment on view public.v_expenses_list is
  'Expenses with category, user, and branch names.';

grant select on public.v_expenses_list to anon, authenticated;

-- ─── 2. v_revenues_list view ──────────────────────────────────────
create or replace view public.v_revenues_list as
select
  r.id,
  r.branch_id,
  r.category_id,
  r.amount,
  r.payment_method,
  r.date,
  r.note,
  r.user_id,
  r.cashbox_id,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  c.name as category_name,
  c.icon as category_icon,
  u.full_name as user_name,
  b.name as branch_name
from public.revenues r
left join public.revenue_categories c on c.id = r.category_id and c.deleted_at is null
left join public.users u on u.id = r.user_id and u.deleted_at is null
left join public.branches b on b.id = r.branch_id and b.deleted_at is null
where r.deleted_at is null;

comment on view public.v_revenues_list is
  'Revenues with category, user, and branch names.';

grant select on public.v_revenues_list to anon, authenticated;

-- ─── 3. v_cashbox_summary view ────────────────────────────────────
create or replace view public.v_cashbox_summary as
select
  cb.id,
  cb.branch_id,
  cb.user_id,
  cb.opening_balance,
  cb.closing_balance,
  cb.expected_closing,
  cb.variance,
  cb.opened_at,
  cb.closed_at,
  cb.status,
  cb.notes,
  cb.created_at,
  b.name as branch_name,
  u.full_name as user_name,
  -- Computed totals from transactions
  (
    select coalesce(sum(amount), 0)
    from public.cashbox_transactions t
    where t.cashbox_id = cb.id and t.type = 'in' and t.deleted_at is null
  ) as total_in,
  (
    select coalesce(sum(amount), 0)
    from public.cashbox_transactions t
    where t.cashbox_id = cb.id and t.type = 'out' and t.deleted_at is null
  ) as total_out,
  (
    select count(*)
    from public.cashbox_transactions t
    where t.cashbox_id = cb.id and t.deleted_at is null
  ) as transaction_count
from public.cashboxes cb
left join public.branches b on b.id = cb.branch_id and b.deleted_at is null
left join public.users u on u.id = cb.user_id and u.deleted_at is null
where cb.deleted_at is null;

comment on view public.v_cashbox_summary is
  'Cashbox summary with computed totals (in/out/count).';

grant select on public.v_cashbox_summary to anon, authenticated;

-- ─── 4. Indexes ───────────────────────────────────────────────────
create index if not exists idx_cashboxes_branch_status
  on public.cashboxes (branch_id, status, opened_at desc)
  where deleted_at is null;

create index if not exists idx_cashboxes_user
  on public.cashboxes (user_id, status)
  where deleted_at is null;

create index if not exists idx_cashbox_transactions_cashbox
  on public.cashbox_transactions (cashbox_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_expenses_branch_date
  on public.expenses (branch_id, date desc)
  where deleted_at is null;

create index if not exists idx_expenses_category
  on public.expenses (category_id)
  where deleted_at is null;

create index if not exists idx_revenues_branch_date
  on public.revenues (branch_id, date desc)
  where deleted_at is null;

create index if not exists idx_revenues_category
  on public.revenues (category_id)
  where deleted_at is null;
