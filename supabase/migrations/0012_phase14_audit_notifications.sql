-- ============================================================================
-- Migration 0012 — Phase 14 (Audit Logs & Notifications)
-- Contents: notifications table + v_audit_logs_with_users view + indexes.
-- ============================================================================

-- ─── 1. Notifications table ───────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key,
  user_id uuid references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision integer not null default 1,
  sync_status text not null default 'synced'
);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, is_read, created_at desc)
  where deleted_at is null;

create index if not exists idx_notifications_user
  on public.notifications (user_id, created_at desc)
  where deleted_at is null;

-- RLS
alter table public.notifications enable row level security;
drop policy if exists read_active_only on public.notifications;
create policy read_active_only on public.notifications
  for select using (deleted_at is null);

-- ─── 2. v_audit_logs_with_users view ─────────────────────────────
create or replace view public.v_audit_logs_with_users as
select
  a.id, a.user_id, a.action, a.entity, a.entity_id,
  a.before, a.after, a.ip_address, a.user_agent, a.created_at,
  u.full_name as user_name,
  u.username as user_username
from public.audit_logs a
left join public.users u on u.id = a.user_id and u.deleted_at is null
where a.deleted_at is null;

comment on view public.v_audit_logs_with_users is
  'Audit logs with user names for display.';

grant select on public.v_audit_logs_with_users to anon, authenticated;

-- ─── 3. Audit logs index for user filter ──────────────────────────
create index if not exists idx_audit_logs_user_date
  on public.audit_logs (user_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity, created_at desc)
  where deleted_at is null;

create index if not exists idx_audit_logs_action
  on public.audit_logs (action, created_at desc)
  where deleted_at is null;
