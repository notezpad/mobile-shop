# Login 500 Fix — PBKDF2 iteration count exceeded the Cloudflare Workers limit

## Symptom

Every `POST /api/v1/auth/login` returns `500 Internal Server Error` with the
envelope `{"success":false,"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}}`.
The browser shows the red "An unexpected error occurred" banner on the login
page, and the Cloudflare Workers tail logs contain:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 150000).
    at deriveKey (index.js:...)
    at async verifySecret (index.js:...)
    at async loginWithPassword (index.js:...)
    at async dispatch (index.js:...)
```

## Root cause

`packages/shared/src/constants/index.ts` defined
`PBKDF2_ITERATIONS = 150_000`. Cloudflare Workers' WebCrypto implementation
**hard-caps PBKDF2 at 100,000 iterations** to prevent DoS via expensive KDF
operations. Whenever `verifySecret()` parsed the stored hash and called
`crypto.subtle.deriveBits({ iterations: 150_000, ... })`, Workers threw
`NotSupportedError`. The unhandled error bubbled up to the Hono error
handler and produced the 500.

Because the seed SQL (`supabase/migrations/0002_phase1_auth_rbac.sql` and
`supabase/seed/seed.sql`) inserted `super_admin` and `admin` with a
150,000-iteration hash, **every login** for the seed users failed in
production.

## Fix

Five coordinated changes:

1. **`packages/shared/src/constants/index.ts`** — `PBKDF2_ITERATIONS` lowered
   from `150_000` to `100_000` (OWASP 2023 minimum + the Workers ceiling).
   Added a new constant `PBKDF2_WORKERS_MAX_ITERATIONS = 100_000` so the cap
   is documented in code and reusable.

2. **`apps/worker/src/lib/crypto.ts`** —
   - `hashSecret()` now throws eagerly if asked to use more iterations than
     Workers allows (prevents silently writing an unverifiable hash).
   - `verifySecret()` defensively returns `false` if a stored hash requests
     more than 100,000 iterations, so any stale row fails as a clean 401
     "invalid credentials" instead of crashing the request with a 500.

3. **`supabase/migrations/0002_phase1_auth_rbac.sql`** and
   **`supabase/seed/seed.sql`** — the embedded hash for `Admin@123` was
   regenerated at 100,000 iterations:
   `pbkdf2$100000$ewyV6aIax7BXZnWgT4IqzQ==$GADJoM5PFtJfpRCIZbVzXnTmV6KV7Z8VT55Qr7Lf0d8=`

4. **`supabase/migrations/0015_fix_pbkdf2_iterations.sql`** (NEW) — an
   idempotent UPDATE that rewrites the password_hash for the existing
   `super_admin` and `admin` rows in any database that was already seeded
   with the broken 150,000-iteration hash. Run this against your existing
   Supabase project — do NOT re-seed from scratch.

5. **`scripts/generate-password-hash.py`** — `ITERATIONS` lowered to
   `100_000`, with an explanatory comment matching the above.

## How to deploy

### 1) Apply the SQL migration to your existing Supabase database

This is the most important step. Your live DB already contains the broken
`pbkdf2$150000$...` hash. Pick ONE of:

**Option A — Supabase Studio SQL editor (fastest):**
1. Open your Supabase project → SQL Editor.
2. Paste the contents of `supabase/migrations/0015_fix_pbkdf2_iterations.sql`.
3. Run. You should see a NOTICE like:
   `All user password hashes are now within the 100,000-iteration Workers limit.`

**Option B — Supabase CLI:**
```bash
supabase db push
# or, if you manage migrations manually:
supabase migration up
```

After this, `super_admin` and `admin` can log in with `Admin@123` again.

### 2) Rebuild and redeploy the Worker

The Worker bundle must be rebuilt because the TS constant has changed.

```bash
# from repo root
pnpm install
pnpm --filter @mobile-shop/shared build
pnpm --filter @mobile-shop/worker build
pnpm --filter @mobile-shop/web build

# deploy
cd apps/worker
wrangler deploy
```

### 3) Verify

- Visit `https://<your-worker>.workers.dev/login`.
- Log in as `super_admin` / `Admin@123`.
- The request should return `200 OK` with `{ "success": true, "data": { ... session ... } }`.
- The Workers tail log should show no `NotSupportedError`.

## Notes

- **Other users with custom passwords:** if you created non-seed users whose
  passwords were hashed at 150,000 iterations, those hashes cannot be
  transparently migrated (we don't know the plaintext). They must reset
  their password via the admin or forgot-password flow. After the fix,
  those logins will return a clean 401 instead of a 500 — no surprise
  crashes.

- **Why not raise the iteration count back to 150k via a different KDF?**
  Switching to Argon2id (via WASM) or bcrypt would lift the 100k limit, but
  it is a much larger change (WASM bundle, FFI bindings, re-hash migration,
  cross-runtime compatibility with the offline PIN check). 100,000 PBKDF2
  iterations is the OWASP 2023 minimum, so the current fix is both safe and
  minimal. Treat Argon2id migration as a future hardening task.

- **The Supabase Advisor "SECURITY DEFINER" warnings** shown in the
  dashboard screenshot (4 critical issues on views
  `v_tenant_members`, `v_role_permissions`, `v_branches_summary`,
  `v_products_summary`) are unrelated to the login bug and are not blocking.
  They are Supabase's standard recommendation to replace
  `SECURITY DEFINER` views with `SECURITY INVOKER` views when RLS already
  protects the underlying tables. Address them as a separate hardening
  pass: for each listed view, run
  `ALTER VIEW public.<view> SECURITY INVOKER;` after confirming RLS is
  enabled on every base table the view reads from.
