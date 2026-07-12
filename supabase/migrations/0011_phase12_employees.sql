-- ============================================================================
-- Migration 0011 — Phase 12 (Employees & HR)
-- Contents: v_employees_summary + v_attendance_list views + indexes.
-- ============================================================================

-- ─── 1. v_employees_summary view ──────────────────────────────────
-- Includes performance stats: sales count/total + repairs count/revenue.
create or replace view public.v_employees_summary as
select
  e.id, e.user_id, e.branch_id, e.code, e.full_name, e.national_id,
  e.phone, e.address, e.hire_date, e.termination_date, e.status, e.position,
  e.base_salary, e.allowances, e.shift_id, e.photo_url,
  e.created_at, e.updated_at, e.deleted_at,
  b.name as branch_name,
  s.name as shift_name,
  s.start_time as shift_start_time,
  s.end_time as shift_end_time,
  u.username as user_username,
  -- Sales stats (if linked to a user who is a cashier)
  (
    select count(*) from public.sales sa
    where sa.cashier_id = e.user_id and sa.deleted_at is null and sa.status = 'completed'
  ) as sales_count,
  (
    select coalesce(sum(sa.total), 0) from public.sales sa
    where sa.cashier_id = e.user_id and sa.deleted_at is null and sa.status = 'completed'
  ) as sales_total,
  -- Repairs stats (if linked to a user who is a technician)
  (
    select count(*) from public.repairs r
    where r.technician_id = e.user_id and r.deleted_at is null
  ) as repairs_count,
  (
    select coalesce(sum(r.total), 0) from public.repairs r
    where r.technician_id = e.user_id and r.deleted_at is null and r.status = 'delivered'
  ) as repairs_revenue
from public.employees e
left join public.branches b on b.id = e.branch_id and b.deleted_at is null
left join public.shifts s on s.id = e.shift_id and s.deleted_at is null
left join public.users u on u.id = e.user_id and u.deleted_at is null
where e.deleted_at is null;

comment on view public.v_employees_summary is
  'Employees with branch, shift, user names + sales/repairs performance stats.';

grant select on public.v_employees_summary to anon, authenticated;

-- ─── 2. v_attendance_list view ────────────────────────────────────
create or replace view public.v_attendance_list as
select
  a.id, a.employee_id, a.branch_id, a.date, a.check_in, a.check_out,
  a.status, a.notes, a.created_at, a.updated_at, a.deleted_at,
  e.full_name as employee_name,
  e.code as employee_code,
  b.name as branch_name
from public.attendance a
left join public.employees e on e.id = a.employee_id and e.deleted_at is null
left join public.branches b on b.id = a.branch_id and b.deleted_at is null
where a.deleted_at is null;

comment on view public.v_attendance_list is
  'Attendance with employee + branch names.';

grant select on public.v_attendance_list to anon, authenticated;

-- ─── 3. Indexes ───────────────────────────────────────────────────
create index if not exists idx_employees_branch
  on public.employees (branch_id)
  where deleted_at is null;

create index if not exists idx_employees_code
  on public.employees (code)
  where deleted_at is null;

create index if not exists idx_employees_user
  on public.employees (user_id)
  where deleted_at is null and user_id is not null;

create index if not exists idx_attendance_employee_date
  on public.attendance (employee_id, date desc)
  where deleted_at is null;

create index if not exists idx_attendance_branch_date
  on public.attendance (branch_id, date desc)
  where deleted_at is null;
