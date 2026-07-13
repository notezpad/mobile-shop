-- ──────────────────────────────────────────────────────────────────────────
-- Migration 0015: Fix PBKDF2 iteration count + bind super_admin/admin to tenant
-- ──────────────────────────────────────────────────────────────────────────
--
-- This migration addresses THREE post-deploy issues found in production:
--
-- ── Issue A: PBKDF2 iteration count exceeded the Cloudflare Workers limit
-- Cloudflare Workers' WebCrypto rejects PBKDF2 iteration counts above 100,000:
--   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
--   supported (requested 150000).
-- The seed data in migrations 0002 and seed.sql originally used 150,000
-- iterations, which broke EVERY login attempt on the deployed worker
-- (POST /api/v1/auth/login returned 500 "An unexpected error occurred").
--
-- Fix A: re-hash the known seed passwords (`Admin@123` for super_admin + admin)
-- at 100,000 iterations and UPDATE the existing rows in public.users.
-- Also lower the constant in packages/shared/src/constants.ts and add a
-- defensive guard in apps/worker/src/lib/crypto.ts.
--
-- ── Issue B: super_admin / admin have NULL tenant_id → 422 on /sync/pull
-- The 0002 migration creates super_admin BEFORE the 0013 SaaS multi-tenant
-- migration adds the `tenant_id` column. So super_admin is inserted with
-- `tenant_id IS NULL`. If the operator only ran the migrations and forgot
-- to run `supabase/seed/seed.sql`, super_admin (and any user created via
-- the same path) has no tenant — and EVERY authenticated API endpoint that
-- checks `actor.tenantId` (sync/pull, sync/push, sync/full, plus most
-- tenant-scoped reads) returns 422 BUSINESS_RULE_VIOLATION
-- "لا يوجد tenant مرتبط بالجلسة".
--
-- Fix B: idempotently create the default tenant + main branch (same UUIDs
-- as seed.sql) and link super_admin and admin to them. This is the same
-- logic seed.sql performs, but in a migration so it runs as part of
-- `supabase db push` / `supabase migration up` without depending on the
-- operator remembering to run the seed separately.
--
-- ── Issue C: ensure tenant_members row exists for super_admin / admin
-- Without a tenant_members row, the user is technically "in" the tenant
-- (via users.tenant_id) but not registered as a member, which can cause
-- the tenant-switcher and invite flows to misbehave.
--
-- Fix C: idempotently insert tenant_members rows.
-- ──────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════
-- PART 1 — Re-hash seed users at 100,000 iterations
-- ══════════════════════════════════════════════════════════════════════════

-- New hash: pbkdf2$100000$ewyV6aIax7BXZnWgT4IqzQ==$GADJoM5PFtJfpRCIZbVzXnTmV6KV7Z8VT55Qr7Lf0d8=
-- Plaintext: Admin@123
-- Algorithm: PBKDF2-HMAC-SHA256, 100000 iterations, 16-byte salt, 32-byte key

UPDATE public.users
SET password_hash = 'pbkdf2$100000$ewyV6aIax7BXZnWgT4IqzQ==$GADJoM5PFtJfpRCIZbVzXnTmV6KV7Z8VT55Qr7Lf0d8=',
    updated_at = now(),
    revision = coalesce(revision, 0) + 1
WHERE username IN ('super_admin', 'admin')
  AND deleted_at IS NULL
  AND password_hash LIKE 'pbkdf2$150000$%';

-- ══════════════════════════════════════════════════════════════════════════
-- PART 2 — Ensure the default tenant + main branch exist
-- ══════════════════════════════════════════════════════════════════════════
-- Same UUIDs as supabase/seed/seed.sql so the rest of the seed (categories,
-- products, inventory, etc.) remains joinable. ON CONFLICT keeps this
-- idempotent — safe to run on top of an existing seed.

INSERT INTO public.tenants (id, name, slug, status, settings)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'موبايل ستور التجريبي',
  'demo-shop',
  'active',
  '{"timezone": "Africa/Cairo"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Main branch belongs to the default tenant. Some deployments used the
-- auto-generated branches row from migration 0003 (no fixed UUID); we
-- match by `is_main = true` to update that row in place instead of
-- inserting a duplicate.

INSERT INTO public.branches (
  id, name, code, is_main, is_active, settings, tenant_id,
  created_at, updated_at, deleted_at, revision, sync_status
)
SELECT
  'b0000000-0000-4000-8000-000000000001',
  'الفرع الرئيسي',
  'MAIN',
  true,
  true,
  '{"taxRate": 14, "currency": "EGP", "receiptHeader": "مرحباً بكم", "receiptFooter": "شكراً لزيارتكم", "lowStockThreshold": 5, "enableVatInvoice": true, "vatNumber": "312-123-456", "printerType": "a4", "printerName": null}'::jsonb,
  'a0000000-0000-4000-8000-000000000001',
  now(), now(), null, 1, 'synced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches
  WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
    AND is_main = true
    AND deleted_at IS NULL
);

-- ══════════════════════════════════════════════════════════════════════════
-- PART 3 — Link super_admin / admin to the default tenant + main branch
-- ══════════════════════════════════════════════════════════════════════════

UPDATE public.users
SET tenant_id = 'a0000000-0000-4000-8000-000000000001',
    branch_id = 'b0000000-0000-4000-8000-000000000001',
    updated_at = now(),
    revision = coalesce(revision, 0) + 1
WHERE username IN ('super_admin', 'admin')
  AND deleted_at IS NULL
  AND (
    tenant_id IS NULL
    OR tenant_id <> 'a0000000-0000-4000-8000-000000000001'
  );

-- Also link super_admin/admin created in 0002 but never bound to a branch.
UPDATE public.users
SET branch_id = 'b0000000-0000-4000-8000-000000000001',
    updated_at = now()
WHERE username IN ('super_admin', 'admin')
  AND tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND branch_id IS NULL
  AND deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- PART 4 — Ensure tenant_members rows exist (so the user is a real member)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO public.tenant_members (
  id, tenant_id, user_id, role_key, is_default, joined_at,
  created_at, updated_at, deleted_at
)
SELECT
  gen_random_uuid(),
  'a0000000-0000-4000-8000-000000000001',
  u.id,
  CASE WHEN u.username = 'super_admin' THEN 'super_admin' ELSE 'admin' END,
  true,
  now(), now(), now(), null
FROM public.users u
WHERE u.username IN ('super_admin', 'admin')
  AND u.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = u.id
      AND tm.tenant_id = 'a0000000-0000-4000-8000-000000000001'
      AND tm.deleted_at IS NULL
  );

-- ══════════════════════════════════════════════════════════════════════════
-- PART 5 — Sanity checks (NOTICE-level, never fail the migration)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  legacy_count integer;
  unbound_count integer;
BEGIN
  SELECT count(*) INTO legacy_count
  FROM public.users
  WHERE password_hash LIKE 'pbkdf2$150000$%'
    AND deleted_at IS NULL;

  IF legacy_count > 0 THEN
    RAISE NOTICE 'There are still % user(s) with a 150,000-iteration PBKDF2 hash. They must reset their password via the admin or forgot-password flow.', legacy_count;
  ELSE
    RAISE NOTICE 'All user password hashes are now within the 100,000-iteration Workers limit.';
  END IF;

  SELECT count(*) INTO unbound_count
  FROM public.users
  WHERE username IN ('super_admin', 'admin')
    AND (tenant_id IS NULL OR branch_id IS NULL)
    AND deleted_at IS NULL;

  IF unbound_count > 0 THEN
    RAISE NOTICE 'WARNING: % seed user(s) still have NULL tenant_id or branch_id — check the migration log for errors.', unbound_count;
  ELSE
    RAISE NOTICE 'All seed users (super_admin, admin) are now bound to the default tenant and main branch.';
  END IF;
END $$;
