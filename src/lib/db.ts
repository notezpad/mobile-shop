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
// one request inside a *different* request.
//
// FIX (performance): Previously, `createPrismaClient()` was called on *every*
// property access via the Proxy getter — meaning a single API route that
// accessed `db.sale`, `db.product`, and `db.customer` would create THREE
// separate PrismaClient instances and open THREE separate TCP connections,
// even though they all lived in the same request. Each connection takes
// ~80–200 ms to establish on Supabase's pooler.
//
// The fix: use AsyncLocalStorage to scope one PrismaClient per request.
// The first access creates the client and stores it; subsequent accesses
// in the same request reuse it. The client is never reused across requests.

import { AsyncLocalStorage } from 'node:async_hooks'

const requestStorage = new AsyncLocalStorage<{ client: PrismaClient }>()

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

/**
 * Get or create a PrismaClient for the current request scope.
 * If we're inside a `withDb` context, reuse the same client.
 * Otherwise, create a fresh one (fallback for safety).
 */
function getClient(): PrismaClient {
  const store = requestStorage.getStore()
  if (store) return store.client
  // Fallback: no async context (e.g. top-level module init). Create a fresh client.
  return createPrismaClient()
}

/**
 * Wrap an async request handler to scope a single PrismaClient for the
 * entire request. Call this in middleware or at the top of each route handler.
 *
 * Usage in a route:
 *   export async function GET() {
 *     return withDb(async () => {
 *       const data = await db.sale.findMany(...)
 *       return NextResponse.json(data)
 *     })
 *   }
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const client = createPrismaClient()
  return requestStorage.run({ client }, fn)
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client as object, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
