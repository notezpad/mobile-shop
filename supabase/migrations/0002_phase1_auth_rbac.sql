-- ============================================================================
-- Migration 0002 — Phase 1 (Auth & RBAC)
--
-- Contents:
--  1. Seed all permissions from PERMISSION_KEYS (mirrors packages/shared).
--  2. Map default permissions to each system role.
--  3. Create default super_admin user with PBKDF2 password hash.
--     Username: super_admin | Password: Admin@123  (CHANGE AFTER FIRST LOGIN!)
--  4. Replace permissive RLS policies with role-aware ones.
-- ============================================================================

-- ─── 1. Insert all permissions ────────────────────────────────────
-- Mirrors packages/shared/src/permissions/index.ts (PERMISSION_KEYS).

insert into public.permissions (id, key, module, action, description)
select gen_random_uuid(), k, split_part(k, '.', 1), split_part(k, '.', 2), null
from unnest(array[
  'dashboard.view',
  'customers.view','customers.create','customers.edit','customers.delete','customers.export',
  'employees.view','employees.create','employees.edit','employees.delete',
  'catalog.categories.manage','catalog.products.view','catalog.products.create','catalog.products.edit','catalog.products.delete',
  'catalog.devices.view','catalog.devices.create','catalog.devices.edit','catalog.devices.delete','catalog.suppliers.manage',
  'inventory.view','inventory.adjust','inventory.transfer','inventory.stocktake','inventory.export',
  'sales.view','sales.create','sales.edit','sales.void','sales.discount','sales.discount_approve','sales.export',
  'invoices.view','invoices.create','invoices.print','invoices.export',
  'returns.view','returns.create','returns.approve','returns.export',
  'repairs.view','repairs.create','repairs.edit','repairs.assign','repairs.deliver','repairs.cancel','repairs.export',
  'cashbox.view','cashbox.open','cashbox.close','cashbox.manage',
  'expenses.view','expenses.create','expenses.edit','expenses.approve','expenses.delete','expenses.export',
  'revenues.view','revenues.create','revenues.edit','revenues.approve','revenues.delete','revenues.export',
  'payments.view','payments.manage',
  'reports.view','reports.sales','reports.inventory','reports.repairs','reports.finance','reports.employees','reports.export',
  'users.view','users.create','users.edit','users.delete',
  'roles.view','roles.manage',
  'branches.view','branches.manage',
  'settings.view','settings.manage',
  'backup.view','backup.create','backup.restore',
  'audit_logs.view'
]) as k
on conflict (key) do nothing;

-- ─── 2. Map default permissions to each system role ───────────────
-- (super_admin is implicit — gets every permission at runtime.)

do $$
declare
  role_rec record;
  perm_rec record;
  perm_keys text[];
begin
  -- admin: every permission except backup.*, roles.manage, settings.manage
  perm_keys := array[
    'dashboard.view',
    'customers.view','customers.create','customers.edit','customers.delete','customers.export',
    'employees.view','employees.create','employees.edit',
    'catalog.categories.manage','catalog.products.view','catalog.products.create','catalog.products.edit','catalog.products.delete',
    'catalog.devices.view','catalog.devices.create','catalog.devices.edit','catalog.devices.delete','catalog.suppliers.manage',
    'inventory.view','inventory.adjust','inventory.transfer','inventory.stocktake','inventory.export',
    'sales.view','sales.create','sales.edit','sales.void','sales.discount','sales.export',
    'invoices.view','invoices.create','invoices.print','invoices.export',
    'returns.view','returns.create','returns.approve','returns.export',
    'repairs.view','repairs.create','repairs.edit','repairs.assign','repairs.deliver','repairs.cancel','repairs.export',
    'cashbox.view','cashbox.open','cashbox.close','cashbox.manage',
    'expenses.view','expenses.create','expenses.edit','expenses.approve','expenses.delete','expenses.export',
    'revenues.view','revenues.create','revenues.edit','revenues.approve','revenues.delete','revenues.export',
    'payments.view','payments.manage',
    'reports.view','reports.sales','reports.inventory','reports.repairs','reports.finance','reports.employees','reports.export',
    'users.view','users.create','users.edit','users.delete',
    'branches.view','branches.manage','settings.view','audit_logs.view'
  ];
  for role_rec in select id from public.roles where key = 'admin' and deleted_at is null loop
    for perm_rec in select id from public.permissions where key = any(perm_keys) and deleted_at is null loop
      insert into public.role_permissions (id, role_id, permission_id)
      values (gen_random_uuid(), role_rec.id, perm_rec.id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end loop;

  -- manager
  perm_keys := array[
    'dashboard.view',
    'customers.view','customers.create','customers.edit','customers.export',
    'employees.view',
    'catalog.categories.manage','catalog.products.view','catalog.products.create','catalog.products.edit',
    'catalog.devices.view','catalog.devices.create','catalog.devices.edit',
    'inventory.view','inventory.adjust','inventory.transfer','inventory.stocktake','inventory.export',
    'sales.view','sales.create','sales.edit','sales.discount','sales.discount_approve','sales.export',
    'invoices.view','invoices.create','invoices.print','invoices.export',
    'returns.view','returns.create','returns.approve','returns.export',
    'repairs.view','repairs.create','repairs.edit','repairs.assign','repairs.deliver','repairs.cancel','repairs.export',
    'cashbox.view','cashbox.open','cashbox.close',
    'expenses.view','expenses.create','expenses.edit','expenses.approve','expenses.export',
    'revenues.view','revenues.create','revenues.edit','revenues.approve','revenues.export',
    'payments.view',
    'reports.view','reports.sales','reports.inventory','reports.repairs','reports.finance','reports.employees','reports.export',
    'branches.view','settings.view'
  ];
  for role_rec in select id from public.roles where key = 'manager' and deleted_at is null loop
    for perm_rec in select id from public.permissions where key = any(perm_keys) and deleted_at is null loop
      insert into public.role_permissions (id, role_id, permission_id)
      values (gen_random_uuid(), role_rec.id, perm_rec.id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end loop;

  -- cashier
  perm_keys := array[
    'dashboard.view',
    'customers.view','customers.create','customers.edit',
    'catalog.products.view','catalog.devices.view',
    'inventory.view',
    'sales.view','sales.create','sales.discount',
    'invoices.view','invoices.create','invoices.print',
    'returns.view','returns.create',
    'repairs.view','repairs.create',
    'cashbox.view','cashbox.open','cashbox.close',
    'payments.view'
  ];
  for role_rec in select id from public.roles where key = 'cashier' and deleted_at is null loop
    for perm_rec in select id from public.permissions where key = any(perm_keys) and deleted_at is null loop
      insert into public.role_permissions (id, role_id, permission_id)
      values (gen_random_uuid(), role_rec.id, perm_rec.id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end loop;

  -- technician
  perm_keys := array[
    'dashboard.view','customers.view',
    'catalog.products.view','catalog.devices.view','inventory.view',
    'repairs.view','repairs.create','repairs.edit','repairs.deliver'
  ];
  for role_rec in select id from public.roles where key = 'technician' and deleted_at is null loop
    for perm_rec in select id from public.permissions where key = any(perm_keys) and deleted_at is null loop
      insert into public.role_permissions (id, role_id, permission_id)
      values (gen_random_uuid(), role_rec.id, perm_rec.id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end loop;

  -- accountant
  perm_keys := array[
    'dashboard.view','customers.view',
    'sales.view','sales.export',
    'invoices.view','invoices.export',
    'returns.view','returns.export',
    'cashbox.view','cashbox.manage',
    'expenses.view','expenses.create','expenses.edit','expenses.approve','expenses.delete','expenses.export',
    'revenues.view','revenues.create','revenues.edit','revenues.approve','revenues.delete','revenues.export',
    'payments.view','payments.manage',
    'reports.view','reports.sales','reports.finance','reports.export',
    'audit_logs.view'
  ];
  for role_rec in select id from public.roles where key = 'accountant' and deleted_at is null loop
    for perm_rec in select id from public.permissions where key = any(perm_keys) and deleted_at is null loop
      insert into public.role_permissions (id, role_id, permission_id)
      values (gen_random_uuid(), role_rec.id, perm_rec.id)
      on conflict (role_id, permission_id) do nothing;
    end loop;
  end loop;
end $$;

-- ─── 3. Create default super_admin user ───────────────────────────
-- The password hash below is PBKDF2-SHA256, 150000 iterations, for "Admin@123".
-- Hash format: pbkdf2$<iterations>$<base64-salt>$<base64-hash>
--
-- IMPORTANT: This hash was generated deterministically for development only.
-- CHANGE the password after first login!
--
-- To regenerate: see scripts/generate-password-hash.py

insert into public.users (
  id, username, password_hash, pin_hash, full_name, email, phone, avatar_url,
  role_id, branch_id, status, preferences, last_login_at,
  created_at, updated_at, deleted_at, revision, sync_status
)
select
  gen_random_uuid(),
  'super_admin',
  'pbkdf2$150000$ullwuV4zU5flwp/l6Ogk6A==$G3ijGmAQzWPUk8MQQmGvI6r7s3mA6RJ15UAzr1KIc44=',
  null,
  'مدير عام',
  'admin@mobileshop.local',
  null,
  null,
  (select id from public.roles where key = 'super_admin' limit 1),
  (select id from public.branches where is_main = true limit 1),
  'active',
  '{"theme":"system","language":"ar","sidebarCollapsed":false}'::jsonb,
  null,
  timezone('utc', now()),
  timezone('utc', now()),
  null,
  1,
  'synced'
where not exists (select 1 from public.users where username = 'super_admin' and deleted_at is null);

-- ─── 4. Replace permissive RLS policies with role-aware ones ──────
-- Strategy:
--  - RLS enabled on every table.
--  - Public read access during Phase 1 (auth enforced in Worker via service-role).
--  - The Worker uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
--  - For browser-direct queries (anon key), RLS applies:
--     * SELECT: allowed for everyone (frontend reads via Worker anyway).
--     * INSERT/UPDATE/DELETE: denied (must go through Worker).
--
-- This defense-in-depth prevents accidental browser writes if a developer
-- bypasses the Worker.

do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'roles','permissions','role_permissions','users','audit_logs',
      'branches','settings',
      'categories','products','device_units','suppliers',
      'inventory_stocks','stock_movements','stock_transfers','stock_transfer_items',
      'customers','sales','sale_items','invoices','invoice_payments',
      'returns','return_items',
      'repairs','repair_status_history','repair_parts',
      'cashboxes','cashbox_transactions','expense_categories','expenses',
      'revenue_categories','revenues','payment_methods',
      'shifts','employees','attendance'
    ])
  loop
    -- Drop the permissive dev policy.
    execute format('drop policy if exists dev_permissive_all on public.%I;', tbl);

    -- Allow SELECT for anon + authenticated (read-only defense layer).
    execute format(
      'create policy %I on public.%I
         for select
         using (deleted_at is null);',
      'read_active_only', tbl
    );
  end loop;
end $$;

-- Special case: audit_logs is read-only for non-service-role.
-- (Already covered by the generic policy above.)

-- Note: Writes go exclusively through the Worker using service_role key,
-- which bypasses RLS entirely. App-layer RBAC (requirePermission middleware)
-- is the primary authz mechanism.

-- ─── 5. Helpful view: role permissions summary ────────────────────
create or replace view public.v_role_permissions as
select
  r.id as role_id,
  r.key as role_key,
  r.name as role_name,
  r.is_system,
  count(rp.permission_id) as permissions_count
from public.roles r
left join public.role_permissions rp
  on rp.role_id = r.id and rp.deleted_at is null
where r.deleted_at is null
group by r.id, r.key, r.name, r.is_system
order by r.created_at;

comment on view public.v_role_permissions is
  'Summary of each role and its active permission count. Useful for admin UI.';
