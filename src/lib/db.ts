// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime. Without this
// import, pg's TCP connections will fail on Workers even with nodejs_compat.
import 'pg-cloudflare'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl } from './env'

// On Cloudflare Workers there is no traditional Node process. We use Prisma's
// driver adapter with node-postgres (`pg`) over Workers' TCP sockets. The
// pg-cloudflare import above patches pg to use Workers-compatible sockets.
// The DB URL should be the pooled connection string (Supabase port 6543).
//
// IMPORTANT: we intentionally do NOT cache the PrismaClient/pg connection in
// a module-level global across requests. Cloudflare Workers forbids reusing
// an I/O object (like a TCP socket opened by `pg`) that was created during
// one request inside a *different* request — even if the same Worker
// isolate happens to be reused for both. Doing so either hangs the request
// forever (until the runtime force-cancels it: "the Workers runtime
// canceled this request because it detected that your Worker's code had
// hung") or throws immediately on the next request once the stale socket is
// touched. We saw exactly this pattern in production: a request would
// succeed, then the next one on the same warm isolate would hang or 500.
//
// The fix is to open a fresh, single connection for every request instead.
// It costs a bit of extra connect latency per request, but it's correct.
function createPrismaClient() {
  const connectionString = readDatabaseUrl()

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  // max: 1 — each PrismaClient instance here lives for a single request, so
  // there's no benefit to a multi-connection pool, and keeping it at 1 avoids
  // needlessly eating into Supabase's pooled-connection budget.
  const adapter = new PrismaPg({ connectionString, max: 1 })
  return new PrismaClient({ adapter })
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = createPrismaClient()
    // IMPORTANT: pass `client` (not the Proxy) as the receiver so that any
    // internal getters resolve against the real client. Additionally, if the
    // resolved value is a function (e.g. `$transaction`, or any model method
    // like `sale.create`), we must bind it to `client`. Without this,
    // `db.$transaction(cb)` would invoke `$transaction` with `this` set to
    // the Proxy (because it's called as `db.$transaction(...)`), causing any
    // internal `this.*` access inside Prisma's implementation to hit the
    // Proxy's `get` trap again and spin up a *second*, unrelated
    // PrismaClient/connection mid-transaction. That mismatch is exactly what
    // produced the intermittent "Transaction not found" 500s in production.
    const value = Reflect.get(client as object, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
