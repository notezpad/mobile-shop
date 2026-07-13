# Mobile Shop ERP — Production Fixes

This document describes the three coordinated fixes that resolve the issues
seen on the deployed Cloudflare Worker.

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| A | `POST /api/v1/auth/login` → 500 "An unexpected error occurred" | PBKDF2 iteration count (150,000) exceeded the Cloudflare Workers hard cap (100,000) | Lower to 100,000 + re-hash seed users + defensive guard |
| B | Dashboard crashes 2 s after login with red banner `Slot failed to slot onto its children. Expected a single React element child or 'Slottable'` | `<Button asChild>` always passed `[null, <Link>]` to Radix Slot — and `React.Children.count()` does NOT skip `null`, so count = 2 → Slot throws | Pass `children` straight through to Slot in `asChild` mode |
| C | `POST /api/v1/sync/pull` → 422 "لا يوجد tenant مرتبط بالجلسة" | `super_admin` / `admin` created in migration 0002 have `tenant_id = NULL` because the column only appears in migration 0013; without `seed.sql` the link is never created | Migration 0015 now idempotently creates the default tenant + main branch and links the seed users |

---

## Issue A — Login 500 (PBKDF2 iteration count)

### Symptom

Every login attempt returns `500 Internal Server Error` with the envelope
`{"success":false,"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}}`.
The Cloudflare Workers tail logs contain:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 150000).
    at deriveKey (index.js:...)
    at async verifySecret (index.js:...)
    at async loginWithPassword (index.js:...)
```

### Root cause

`packages/shared/src/constants/index.ts` defined
`PBKDF2_ITERATIONS = 150_000`. Cloudflare Workers' WebCrypto implementation
**hard-caps PBKDF2 at 100,000 iterations** to prevent DoS via expensive KDF
operations. `crypto.subtle.deriveBits({ iterations: 150_000, ... })` threw
`NotSupportedError`. The unhandled error bubbled up to the Hono error
handler and produced the 500. Both seed users (`super_admin`, `admin`)
were stored with a 150,000-iteration hash, so every login failed.

### Fix (5 files)

1. **`packages/shared/src/constants/index.ts`** — `PBKDF2_ITERATIONS` lowered
   from `150_000` to `100_000` (OWASP 2023 minimum + the Workers ceiling).
   Added `PBKDF2_WORKERS_MAX_ITERATIONS = 100_000` so the cap is documented
   in code.
2. **`apps/worker/src/lib/crypto.ts`** — `hashSecret()` throws eagerly if
   asked to use more iterations than Workers allows; `verifySecret()`
   defensively returns `false` for any hash whose declared iteration count
   exceeds 100,000 so a stale row produces a clean 401 instead of a 500.
3. **`supabase/migrations/0002_phase1_auth_rbac.sql`** and
   **`supabase/seed/seed.sql`** — embedded hash for `Admin@123` regenerated
   at 100,000 iterations.
4. **`supabase/migrations/0015_fix_pbkdf2_iterations.sql`** (NEW, includes
   B and C too — see below) — idempotent UPDATE that rewrites the
   password_hash for existing `super_admin` / `admin` rows.
5. **`scripts/generate-password-hash.py`** — `ITERATIONS = 100_000`.

---

## Issue B — Dashboard crash 2 s after login (Radix Slot)

### Symptom

Login succeeds, the dashboard renders for ~2 seconds, then a red banner
appears: `Unexpected Application Error — Slot failed to slot onto its
children. Expected a single React element child or 'Slottable'.`

The DevTools console shows the same error multiple times, ultimately
captured by React Router:

```
Error: Slot failed to slot onto its children. Expected a single React element child or 'Slottable'.
    at index.mjs:43:15
    at react-dom.production.min.js:...
React Router caught the following error during render Error: ...
```

### Root cause

`apps/web/src/components/ui/button.tsx` rendered this structure for every
`<Button asChild>`:

```tsx
<Comp ...>            {/* Comp = Slot when asChild=true */}
  {loading ? <svg>...</svg> : null}
  {children}
</Comp>
```

Even with `loading={false}` (the default), JSX compiles the two adjacent
expressions into two `children` slots, so `Slot` receives
`children = [null, <Link>]`.

**Critical detail:** `React.Children.count()` does NOT skip `null` /
`false` / `undefined` (only `React.Children.toArray()` does). Verified
directly:

```
count([null, <a/>])       = 2     ← Slot throws
toArray([null, <a/>])     = [<a/>]  length 1
```

`@radix-ui/react-slot@1.2.x` checks `React.Children.count(children) > 1`
and throws the error. So **every** `<Button asChild>` usage in the app
(~30 call sites) was broken.

### Fix (1 file)

**`apps/web/src/components/ui/button.tsx`** — in `asChild` mode, pass
`children` straight through to `Slot` without injecting the conditional
spinner. The loading state is still surfaced via `aria-busy` and
`data-loading` so consumers can style their own spinner. In non-`asChild`
mode the spinner is injected as before.

---

## Issue C — 422 on `/sync/pull` (NULL `tenant_id`)

### Symptom

After fixing A and B, login works and the dashboard renders, but the
DevTools Network tab shows `POST /api/v1/sync/pull` returning `422`
with `{"error":{"code":"BUSINESS_RULE_VIOLATION","message":"لا يوجد tenant مرتبط بالجلسة"}}`.
The 422 fires every 30 s (the auto-sync interval) and on every window
focus.

### Root cause

Migration `0002_phase1_auth_rbac.sql` creates `super_admin` BEFORE
migration `0013_saas_multi_tenant.sql` adds the `tenant_id` column to
`users`. So the `super_admin` row is inserted with `tenant_id IS NULL`.

`supabase/seed/seed.sql` is supposed to fix this with an
`UPDATE public.users SET tenant_id = ... WHERE username = 'super_admin'
AND tenant_id IS NULL;`, but:

- `supabase db push` / `supabase migration up` apply migrations only —
  the seed is a separate step (`supabase db reset` or manual `psql -f
  seed.sql`).
- If the operator skipped the seed (very common in dev/staging), the
  `super_admin` and `admin` rows stay unbound.

At login, the worker reads `user.tenant_id` (NULL) and puts
`tenantId: null` into the JWT. Every authenticated endpoint that does
`if (!actor.tenantId) throw BUSINESS_RULE_VIOLATION` then fails with 422.
That includes `/sync/pull`, `/sync/push`, `/sync/full`, and most
tenant-scoped reads.

### Fix (1 file — same migration as A)

**`supabase/migrations/0015_fix_pbkdf2_iterations.sql`** — Parts 2–4
now idempotently:

1. Insert the default tenant `a0000000-...-001` (`ON CONFLICT (slug) DO
   NOTHING`) — same UUID as `seed.sql`.
2. Insert the main branch `b0000000-...-001` if no main branch exists
   for that tenant.
3. UPDATE `super_admin` / `admin` rows: set `tenant_id` and `branch_id`
   to the new IDs when NULL or pointing elsewhere.
4. Insert `tenant_members` rows (so the user is registered as a member
   of the tenant, not just linked via `users.tenant_id`).
5. Print NOTICE-level sanity checks at the end.

All statements are idempotent — safe to run on a fresh DB, a
migrations-only DB, or a fully-seeded DB.

---

## How to deploy

### 1) Apply the SQL migration to your existing Supabase database

This is the most important step. Pick ONE of:

**Option A — Supabase Studio SQL editor (fastest):**
1. Open your Supabase project → SQL Editor.
2. Paste the contents of `supabase/migrations/0015_fix_pbkdf2_iterations.sql`.
3. Run. You should see two NOTICEs:
   ```
   NOTICE: All user password hashes are now within the 100,000-iteration Workers limit.
   NOTICE: All seed users (super_admin, admin) are now bound to the default tenant and main branch.
   ```

**Option B — Supabase CLI:**
```bash
supabase db push
# or, if you manage migrations manually:
supabase migration up
```

After this, `super_admin` and `admin` can log in, see the dashboard, and
sync without 422s.

### 2) Rebuild and redeploy the Worker + frontend

Both the TS constant (`PBKDF2_ITERATIONS`) and the React component
(`Button.tsx`) have changed — the entire bundle must be rebuilt.

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

1. Visit `https://<your-worker>.workers.dev/login`.
2. Log in as `super_admin` / `Admin@123`.
3. The login request should return `200` with a session envelope.
4. The dashboard should render and stay rendered (no red "Slot failed"
   banner after 2 seconds).
5. The DevTools Network tab should show `POST /api/v1/sync/pull` returning
   `200` (no more 422).
6. The Workers tail log should show no `NotSupportedError` and no
   `BUSINESS_RULE_VIOLATION`.

---

## Notes

- **Other users with custom passwords:** if you created non-seed users
  whose passwords were hashed at 150,000 iterations, those hashes cannot
  be transparently migrated (we don't know the plaintext). They must
  reset their password via the admin or forgot-password flow. After the
  fix, those logins will return a clean 401 instead of a 500 — no
  surprise crashes.

- **Why not raise the iteration count back to 150k via a different KDF?**
  Switching to Argon2id (via WASM) or bcrypt would lift the 100k limit,
  but it is a much larger change (WASM bundle, FFI bindings, re-hash
  migration, cross-runtime compatibility with the offline PIN check).
  100,000 PBKDF2 iterations is the OWASP 2023 minimum, so the current
  fix is both safe and minimal. Treat Argon2id migration as a future
  hardening task.

- **The Supabase Advisor "SECURITY DEFINER" warnings** shown in the
  dashboard screenshot (4 critical issues on views `v_tenant_members`,
  `v_role_permissions`, `v_branches_summary`, `v_products_summary`) are
  unrelated to all three bugs above and are not blocking. They are
  Supabase's standard recommendation to replace `SECURITY DEFINER` views
  with `SECURITY INVOKER` views when RLS already protects the underlying
  tables. Address them as a separate hardening pass: for each listed
  view, run `ALTER VIEW public.<view> SECURITY INVOKER;` after
  confirming RLS is enabled on every base table the view reads from.
