// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime.
import 'pg-cloudflare'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl, isProductionRuntime } from './env'
import { AsyncLocalStorage } from 'node:async_hooks'

const requestStorage = new AsyncLocalStorage<{ client: PrismaClient }>()

// ── Node.js (dev): single global client ───────────────────────────────────
let globalClient: PrismaClient | null = null

// ── Cloudflare Workers (prod): ONE client per isolate lifetime ────────────
// Workers reuse the same isolate for the lifetime of a request AND may
// serve multiple sequential requests in the same isolate. We create ONE
// client at isolate startup and reuse it — this avoids the catastrophic
// pattern of creating a new TCP connection on every db.xyz property access.
//
// NOTE: withDb() is still the preferred pattern for route handlers because
// it scopes the client via AsyncLocalStorage, which is safer. This
// module-level fallback exists so pages/API routes that don't explicitly
// call withDb() don't spawn unlimited connections.
let workerClient: PrismaClient | null = null

function createPrismaClient(): PrismaClient {
  const connectionString = readDatabaseUrl()
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker secret/variable.',
    )
  }
  const adapter = new PrismaPg({ connectionString, max: 1 })
  return new PrismaClient({ adapter })
}

function getClient(): PrismaClient {
  // ── Node.js fast path ───────────────────────────────────────────────────
  if (!isProductionRuntime()) {
    if (!globalClient) globalClient = createPrismaClient()
    return globalClient
  }

  // ── Workers: prefer request-scoped client (withDb wrapper) ─────────────
  const store = requestStorage.getStore()
  if (store) return store.client

  // ── Workers fallback: isolate-level singleton ───────────────────────────
  // If the caller didn't wrap the handler in withDb(), reuse the same
  // isolate-level client rather than spawning a new TCP connection.
  if (!workerClient) workerClient = createPrismaClient()
  return workerClient
}

/**
 * Wrap an async route handler to scope a single PrismaClient for the
 * entire request. Use this in all API routes for cleanest resource
 * management. On Node.js (dev) it's a no-op.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  if (!isProductionRuntime()) return fn()
  const client = workerClient ?? createPrismaClient()
  if (!workerClient) workerClient = client
  return requestStorage.run({ client }, fn)
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client as object, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
