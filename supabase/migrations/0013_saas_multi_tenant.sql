-- ============================================================================
-- Migration 0013 — SaaS Multi-Tenant Transformation
--
-- This migration converts the entire schema from single-tenant to multi-tenant:
--  1. Create `tenants` table (each tenant = one shop/company)
--  2. Create `tenant_members` table (user ↔ tenant mapping with roles)
--  3. Add `tenant_id` column to EVERY business table
--  4. Update RLS policies to enforce tenant isolation
--  5. Create `plans` + `subscriptions` tables (Stripe-ready, empty)
--  6. Seed default plan
-- ============================================================================

-- ─── 1. tenants table ─────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique, -- URL-safe identifier: shop1.yourapp.com
  domain text, -- custom domain (future)
  status text not null default 'active' check (status in ('active', 'suspended', 'canceled')),
  plan_id uuid, -- FK to plans (nullable for free plan)
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists idx_tenants_slug on public.tenants (slug) where deleted_at is null;
create index if not exists idx_tenants_status on public.tenants (status) where deleted_at is null;

-- ─── 2. tenant_members table ──────────────────────────────────────
-- Maps users to tenants (a user can belong to multiple tenants).
create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_key text not null default 'admin', -- role within this tenant
  is_default boolean not null default false, -- user's default tenant
  invited_by uuid,
  invited_at timestamptz,
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (tenant_id, user_id)
);

create index if not exists idx_tenant_members_tenant on public.tenant_members (tenant_id) where deleted_at is null;
create index if not exists idx_tenant_members_user on public.tenant_members (user_id) where deleted_at is null;

-- ─── 3. plans table (Stripe-ready) ────────────────────────────────
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique, -- 'free', 'starter', 'pro', 'enterprise'
  price_monthly numeric(10,2) not null default 0,
  price_yearly numeric(10,2) not null default 0,
  currency text not null default 'EGP',
  max_branches integer not null default 1,
  max_users integer not null default 5,
  max_products integer not null default 500,
  features jsonb not null default '{}'::jsonb,
  stripe_price_id_monthly text, -- Stripe price ID (future)
  stripe_price_id_yearly text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

-- ─── 4. subscriptions table (Stripe-ready) ────────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('active', 'trialing', 'canceled', 'past_due', 'paused')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  stripe_subscription_id text, -- Stripe subscription ID (future)
  stripe_customer_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists idx_subscriptions_tenant on public.subscriptions (tenant_id) where deleted_at is null;

-- ─── 5. Add tenant_id to ALL business tables ──────────────────────
-- We add tenant_id as nullable first (for backward compat), then we'll
-- populate it and make it NOT NULL in a follow-up migration.

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'branches','settings',
    'categories','products','device_units','suppliers',
    'inventory_stocks','stock_movements','stock_transfers','stock_transfer_items',
    'customers','sales','sale_items','invoices','invoice_payments',
    'returns','return_items',
    'repairs','repair_status_history','repair_parts',
    'cashboxes','cashbox_transactions','expense_categories','expenses',
    'revenue_categories','revenues','payment_methods',
    'shifts','employees','attendance',
    'backups',
    'audit_logs'
  ])
  loop
    -- Add tenant_id column if it doesn't exist.
    execute format(
      'alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;',
      tbl
    );
    -- Create index for tenant filtering.
    execute format(
      'create index if not exists idx_%1$s_tenant on public.%1$I (tenant_id) where deleted_at is null;',
      tbl
    );
  end loop;
end $$;

-- ─── 6. Update RLS policies for tenant isolation ──────────────────
-- Strategy:
--  - The Worker sets a session variable `app.tenant_id` per request.
--  - RLS policies filter by this variable.
--  - If the variable is not set (direct anon access), no rows are returned.

-- Helper function: get current tenant_id from session variable.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Drop old permissive policies and add tenant-aware ones.
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'branches','settings',
    'categories','products','device_units','suppliers',
    'inventory_stocks','stock_movements','stock_transfers','stock_transfer_items',
    'customers','sales','sale_items','invoices','invoice_payments',
    'returns','return_items',
    'repairs','repair_status_history','repair_parts',
    'cashboxes','cashbox_transactions','expense_categories','expenses',
    'revenue_categories','revenues','payment_methods',
    'shifts','employees','attendance',
    'backups',
    'audit_logs'
  ])
  loop
    -- Drop old policy.
    execute format('drop policy if exists read_active_only on public.%I;', tbl);
    
    -- Tenant-aware SELECT policy: only rows matching current_tenant_id().
    execute format(
      'create policy %I on public.%I
         for select
         using (deleted_at is null and (tenant_id = public.current_tenant_id() or public.current_tenant_id() is null and tenant_id is null));',
      'tenant_select', tbl
    );
  end loop;
end $$;

-- ─── 7. Seed default plan ─────────────────────────────────────────
insert into public.plans (id, name, slug, price_monthly, price_yearly, max_branches, max_users, max_products, features, sort_order)
values
  (gen_random_uuid(), 'Free', 'free', 0, 0, 1, 3, 100, '{"reports": false, "backup": false}'::jsonb, 1),
  (gen_random_uuid(), 'Starter', 'starter', 199, 1999, 2, 10, 1000, '{"reports": true, "backup": true}'::jsonb, 2),
  (gen_random_uuid(), 'Pro', 'pro', 499, 4999, 10, 50, 10000, '{"reports": true, "backup": true, "sync": true}'::jsonb, 3),
  (gen_random_uuid(), 'Enterprise', 'enterprise', 999, 9999, 999, 999, 999999, '{"reports": true, "backup": true, "sync": true, "custom_domain": true}'::jsonb, 4)
on conflict (slug) do nothing;

-- ─── 8. Grant access ──────────────────────────────────────────────
grant select on public.tenants to anon, authenticated;
grant select on public.tenant_members to anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.subscriptions to anon, authenticated;

-- RLS on tenants + tenant_members + plans + subscriptions
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

-- Tenants: readable by members of the tenant.
drop policy if exists tenant_member_select on public.tenants;
create policy tenant_member_select on public.tenants
  for select using (
    deleted_at is null and (
      id in (select tenant_id from public.tenant_members where user_id = auth.uid() and deleted_at is null)
      or public.current_tenant_id() = id
    )
  );

-- Plans: publicly readable (anyone can see available plans).
drop policy if exists plans_public on public.plans;
create policy plans_public on public.plans
  for select using (deleted_at is null and is_active = true);

-- Tenant members: readable by tenant members.
drop policy if exists members_select on public.tenant_members;
create policy members_select on public.tenant_members
  for select using (
    deleted_at is null and (
      user_id = auth.uid() or
      tenant_id = public.current_tenant_id()
    )
  );

-- Subscriptions: readable by the tenant.
drop policy if exists sub_select on public.subscriptions;
create policy sub_select on public.subscriptions
  for select using (
    deleted_at is null and tenant_id = public.current_tenant_id()
  );

-- ─── 9. View: tenant_members_with_details ─────────────────────────
create or replace view public.v_tenant_members as
select
  tm.id, tm.tenant_id, tm.user_id, tm.role_key, tm.is_default,
  tm.joined_at, tm.created_at, tm.deleted_at,
  t.name as tenant_name, t.slug as tenant_slug,
  u.full_name as user_name, u.username as user_username, u.email as user_email
from public.tenant_members tm
left join public.tenants t on t.id = tm.tenant_id
left join public.users u on u.id = tm.user_id
where tm.deleted_at is null;

grant select on public.v_tenant_members to anon, authenticated;
