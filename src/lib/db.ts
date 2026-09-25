// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime.
import 'pg-cloudflare'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl, isProductionRuntime } from './env'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * ────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE FIX (500 on every page after the first one)
 * ────────────────────────────────────────────────────────────────────────
 * The previous implementation cached ONE PrismaClient per Worker isolate
 * (`workerClient`) and reused it across requests. On Cloudflare Workers the
 * TCP socket behind that client belongs to the request that opened it, so
 * every LATER request in the same isolate fails with:
 *
 *   "Cannot perform I/O on behalf of a different request. I/O objects
 *    created in the context of one request handler cannot be accessed
 *    from a different request handler."
 *
 * That is exactly the observed symptom: the first page loaded (dashboard)
 * works, every subsequent page returns 500 with no data.
 *
 * The fix: the Postgres client is created lazily PER REQUEST, scoped by
 * AsyncLocalStorage, and disconnected when the request ends. Nothing that
 * owns a socket is ever shared between requests.
 */

type RequestStore = { client: PrismaClient | null }

const requestStorage = new AsyncLocalStorage<RequestStore>()

// Node.js (dev) only: a single long-lived client is fine there.
let devClient: PrismaClient | null = null

// Last-resort client for code paths not wrapped in withDb(). It is
// self-healing: a cross-request I/O error recreates it and retries once.
let fallbackClient: PrismaClient | null = null

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

function isCrossRequestOrSocketError(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.message}` : typeof err === 'string' ? err : ''
  return (
    msg.includes('different request') ||
    msg.includes('Cannot perform I/O') ||
    msg.includes('Network connection lost') ||
    msg.includes('Connection terminated') ||
    msg.includes('Socket') ||
    msg.includes('closed') ||
    msg.includes('ECONNRESET')
  )
}

async function disconnectQuietly(client: PrismaClient | null) {
  if (!client) return
  try {
    await client.$disconnect()
  } catch {
    /* ignore */
  }
}

/**
 * Wrap an async route handler so the whole request shares exactly ONE
 * PrismaClient, which is then closed. On Node.js (dev) it's a no-op.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  if (!isProductionRuntime()) return fn()
  const store: RequestStore = { client: null }
  try {
    return await requestStorage.run(store, fn)
  } finally {
    const client = store.client
    store.client = null
    await disconnectQuietly(client)
  }
}

function getClient(): PrismaClient {
  if (!isProductionRuntime()) {
    if (!devClient) devClient = createPrismaClient()
    return devClient
  }

  const store = requestStorage.getStore()
  if (store) {
    if (!store.client) store.client = createPrismaClient()
    return store.client
  }

  if (!fallbackClient) fallbackClient = createPrismaClient()
  return fallbackClient
}

function usingFallback(): boolean {
  return isProductionRuntime() && !requestStorage.getStore()
}

/**
 * Wrap a Prisma delegate (db.sale, db.product, …) so that a cross-request
 * socket error on the shared fallback client transparently recreates the
 * client and retries the call once.
 */
function wrapDelegate(delegate: any, prop: PropertyKey): any {
  return new Proxy(delegate, {
    get(target, method) {
      const value = Reflect.get(target, method, target)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const invoke = (client: PrismaClient) => {
          const d = Reflect.get(client as object, prop, client) as any
          return d[method](...args)
        }
        try {
          const result = value.apply(target, args)
          if (result && typeof result.then === 'function') {
            return result.catch((err: unknown) => {
              if (usingFallback() && isCrossRequestOrSocketError(err)) {
                const stale = fallbackClient
                fallbackClient = createPrismaClient()
                void disconnectQuietly(stale)
                return invoke(fallbackClient)
              }
              throw err
            })
          }
          return result
        } catch (err) {
          if (usingFallback() && isCrossRequestOrSocketError(err)) {
            const stale = fallbackClient
            fallbackClient = createPrismaClient()
            void disconnectQuietly(stale)
            return invoke(fallbackClient)
          }
          throw err
        }
      }
    },
  })
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client as object, prop, client)
    if (typeof value === 'function') return value.bind(client)
    if (value && typeof value === 'object' && typeof prop === 'string' && !prop.startsWith('$')) {
      return wrapDelegate(value, prop)
    }
    return value
  },
})
