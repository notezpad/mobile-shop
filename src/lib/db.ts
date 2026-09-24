// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime. Without this
// import, pg's TCP connections will fail on Workers even with nodejs_compat.
import 'pg-cloudflare'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl, isProductionRuntime } from './env'

import { AsyncLocalStorage } from 'node:async_hooks'

const requestStorage = new AsyncLocalStorage<{ client: PrismaClient }>()

// ⚡ PERFORMANCE FIX: On Node.js (local dev / non-Cloudflare), keep a SINGLE
// global PrismaClient. Creating a new PrismaClient + TCP connection per
// request was adding 200-500ms to EVERY API call — that's why navigating
// between pages took 4+ seconds.
//
// On Cloudflare Workers (production), we still create per-request clients
// because Workers forbid reusing TCP sockets across requests.
let globalClient: PrismaClient | null = null

function createPrismaClient() {
  const connectionString = readDatabaseUrl()

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  // On Cloudflare Workers: max=1 (per-request, no pooling benefit).
  // On Node.js: max=10 (connection pool — reuse across requests).
  const max = isProductionRuntime() ? 1 : 10
  const adapter = new PrismaPg({ connectionString, max })
  return new PrismaClient({ adapter })
}

/**
 * Get or create a PrismaClient for the current request scope.
 *
 * On Node.js (dev): returns the global singleton (1 TCP connection reused
 * across all requests — no per-request overhead).
 * On Cloudflare Workers (prod): returns the per-request client from withDb,
 * or creates a fresh one as fallback.
 */
function getClient(): PrismaClient {
  // 🚀 Node.js fast path — reuse global singleton
  if (!isProductionRuntime()) {
    if (!globalClient) {
      globalClient = createPrismaClient()
    }
    return globalClient
  }

  // Cloudflare Workers — use per-request storage
  const store = requestStorage.getStore()
  if (store) return store.client
  return createPrismaClient()
}

/**
 * Wrap an async request handler to scope a single PrismaClient for the
 * entire request. Only needed on Cloudflare Workers (production).
 *
 * On Node.js (dev), this is a no-op — getClient() returns the global.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  // 🚀 Node.js: skip wrapping — global client is used
  if (!isProductionRuntime()) {
    return fn()
  }

  // Cloudflare Workers: create per-request client
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
