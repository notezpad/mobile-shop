-- ──────────────────────────────────────────────────────────────────────────
-- Migration 0015: Fix PBKDF2 iteration count for Cloudflare Workers
-- ──────────────────────────────────────────────────────────────────────────
--
-- BACKGROUND
-- Cloudflare Workers' WebCrypto implementation rejects PBKDF2 iteration counts
-- above 100,000 with:
--   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
--   supported (requested 150000).
-- The seed data in migrations 0002 and seed.sql originally used 150,000
-- iterations, which broke EVERY login attempt on the deployed worker
-- (POST /api/v1/auth/login returned 500 "An unexpected error occurred").
--
-- FIX
-- 1) Lower the iteration count to 100,000 (the OWASP 2023 minimum and the
--    Workers hard ceiling) in packages/shared/src/constants.ts.
-- 2) Re-hash the known seed passwords (`Admin@123` for super_admin + admin)
--    at 100,000 iterations and UPDATE the existing rows in public.users.
--
-- This migration handles step (2) for databases that were already seeded
-- with the broken 150,000-iteration hash. It is idempotent — running it
-- multiple times is safe because the WHERE clause only matches the legacy
-- hash format.
--
-- For users with custom passwords that were hashed at 150,000 iterations:
-- they cannot be re-hashed without knowing the plaintext (which we don't).
-- Those users must use the "forgot password" / admin-reset flow to get a
-- new hash at 100,000 iterations. After this migration, `verifySecret`
-- (apps/worker/src/lib/crypto.ts) defensively returns false for any hash
-- whose declared iteration count exceeds 100,000, so those logins will
-- surface as a clean 401 "invalid credentials" instead of a 500.
-- ──────────────────────────────────────────────────────────────────────────

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

-- Sanity check: confirm there are no remaining 150,000-iteration hashes
-- for the seed users. (Other users may still have them — they need a
-- password reset. This block only raises a NOTICE, it does not fail.)
DO $$
DECLARE
  legacy_count integer;
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
END $$;
