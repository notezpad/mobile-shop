// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime.
import 'pg-cloudflare'

import { PrismaClient, type PrismaClientType } from './prisma-wasm'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl, readEnv, isProductionRuntime } from './env'
import { AsyncLocalStorage } from 'node:async_hooks'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * ────────────────────────────────────────────────────────────────────────
 * PERFORMANCE / 500-503 FIX (2026-09-25)
 * ────────────────────────────────────────────────────────────────────────
 * Symptoms: the whole app is extremely slow, and random requests fail with
 * 500 or 503.
 *
 * Causes found:
 *  1. A brand-new Postgres connection (TCP + TLS handshake through the
 *     pooler) was opened for EVERY request — often TWICE per request,
 *     because requireAuth() runs BEFORE withDb() and therefore used a
 *     separate "fallback" client. That adds hundreds of ms per request and
 *     saturates the pooler's connection limit, which answers new
 *     connections with errors → 500/503.
 *  2. The fallback client is shared between requests, which on Workers
 *     raises "Cannot perform I/O on behalf of a different request".
 *
 * Fixes here:
 *  a. Cloudflare Hyperdrive is used automatically when the HYPERDRIVE
 *     binding exists (connection pooling at the edge → near-zero connect
 *     time). Falls back to DATABASE_URL when it is not configured.
 *     See HYPERDRIVE_SETUP.md.
 *  b. The client is scoped to the CURRENT REQUEST even outside withDb():
 *     it is keyed on the per-request Cloudflare ExecutionContext, so auth
 *     + the route handler share ONE connection instead of two, and no
 *     socket is ever reused across requests.
 *  c. Cross-request / dead-socket errors still self-heal with one retry.
 *
 * ⚡ v10 (2026-10-06) ملاحظة مهمة: جربنا عميل PrismaClient مشترك لكل
 * isolate (عشان نقلل churn بتاع محرك الاستعلام من كل طلب) — لكن بيئتشغيل
 * workerd بيربط I/O (السوكات + تايمرات pg Pool) بسياق الطلب اللي اتعمل فيه،
 * فأي Pool عاش من طلب سابق بيبوظ للطلبات اللي بعده (الاستعلام بيفضل
 * معلّق لحد timeout). عشان كده التصميم لكل طلب بيفضل هو الآمن والمثبت —
 * وتقليل الـ 1102 بيتحقق من طبقة v10 فوقه: كاش حافة أوسع (movements +
 * منتجات المخزون)، ردود أصغر (50 صف + slim)، واستعلامات أقل (tz cache).
 */

type RequestStore = { client: PrismaClientType | null }

const requestStorage = new AsyncLocalStorage<RequestStore>()

// Node.js (dev) only: a single long-lived client is fine there.
let devClient: PrismaClientType | null = null

// Per-request clients for code paths not wrapped in withDb(), keyed on the
// request's own ExecutionContext so they are never shared between requests.
const ctxClients = new WeakMap<object, PrismaClientType>()

// Absolute last resort (no request context at all, e.g. build-time calls).
let fallbackClient: PrismaClientType | null = null

/**
 * Prefer the Hyperdrive connection string (pooled at the edge) and fall back
 * to the plain DATABASE_URL.
 */
function resolveConnectionString(): string | undefined {
  try {
    const ctx = getCloudflareContext() as unknown as {
      then?: unknown
      env?: Record<string, unknown>
    }
    if (ctx && typeof ctx.then !== 'function') {
      const hyperdrive = ctx.env?.['HYPERDRIVE'] as
        | { connectionString?: string }
        | undefined
      const cs = hyperdrive?.connectionString
      if (typeof cs === 'string' && cs.trim().length > 0) return cs.trim()
    }
  } catch {
    /* not in a Worker request scope — use the env var below */
  }
  return readDatabaseUrl()
}

function getCurrentRequestKey(): object | null {
  try {
    const ctx = getCloudflareContext() as unknown as {
      then?: unknown
      ctx?: object
    }
    if (ctx && typeof ctx.then !== 'function' && ctx.ctx && typeof ctx.ctx === 'object') {
      return ctx.ctx
    }
  } catch {
    /* ignore */
  }
  return null
}

function createPrismaClient(): PrismaClientType {
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker secret/variable, or bind Hyperdrive as HYPERDRIVE.',
    )
  }
  // max:1 — a Worker request must not hold more than one socket, and
  // Hyperdrive does the real pooling on the edge side.
  const adapter = new PrismaPg({
    connectionString,
    max: 1,
    // Fail fast instead of hanging for 30s when the pooler is saturated:
    // a quick error is retried, a hanging request turns into a 503.
    connectionTimeoutMillis: 8000,
    idle_in_transaction_session_timeout: 10000,
  } as never)
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

async function disconnectQuietly(client: PrismaClientType | null) {
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

  // Reuse the client the auth layer already opened for this same request
  // instead of opening a second connection.
  const key = getCurrentRequestKey()
  const existing = key ? ctxClients.get(key) : null
  const store: RequestStore = { client: existing ?? null }

  try {
    return await requestStorage.run(store, fn)
  } finally {
    const client = store.client
    store.client = null
    if (key) ctxClients.delete(key)
    await disconnectQuietly(client)
  }
}

function getClient(): PrismaClientType {
  if (!isProductionRuntime()) {
    if (!devClient) devClient = createPrismaClient()
    return devClient
  }

  const store = requestStorage.getStore()
  if (store) {
    if (!store.client) {
      const key = getCurrentRequestKey()
      const reused = key ? ctxClients.get(key) : null
      store.client = reused ?? createPrismaClient()
      if (key && !reused) ctxClients.set(key, store.client)
    }
    return store.client
  }

  // Not inside withDb() (e.g. requireAuth): still scope the client to this
  // request via its ExecutionContext so it is never shared across requests.
  const key = getCurrentRequestKey()
  if (key) {
    let client = ctxClients.get(key)
    if (!client) {
      client = createPrismaClient()
      ctxClients.set(key, client)
    }
    return client
  }

  if (!fallbackClient) fallbackClient = createPrismaClient()
  return fallbackClient
}

function usingFallback(): boolean {
  return (
    isProductionRuntime() &&
    !requestStorage.getStore() &&
    getCurrentRequestKey() === null
  )
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
        const invoke = (client: PrismaClientType) => {
          const d = Reflect.get(client as object, prop, client) as any
          return d[method](...args)
        }
        const recover = (err: unknown) => {
          if (!isCrossRequestOrSocketError(err)) throw err
          if (usingFallback()) {
            const stale = fallbackClient
            fallbackClient = createPrismaClient()
            void disconnectQuietly(stale)
            return invoke(fallbackClient)
          }
          // Request-scoped client whose socket died: replace it once and retry
          // instead of bubbling up a 500.
          const key = getCurrentRequestKey()
          const store = requestStorage.getStore()
          if (key || store) {
            const fresh = createPrismaClient()
            if (key) ctxClients.set(key, fresh)
            if (store) store.client = fresh
            return invoke(fresh)
          }
          throw err
        }
        try {
          const result = value.apply(target, args)
          if (result && typeof result.then === 'function') {
            return result.catch(recover)
          }
          return result
        } catch (err) {
          return recover(err)
        }
      }
    },
  })
}

export const db = new Proxy({} as PrismaClientType, {
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

/** Exposed for diagnostics: which connection route is in use. */
export function describeDbConnection(): 'hyperdrive' | 'direct' | 'missing' {
  try {
    const ctx = getCloudflareContext() as unknown as {
      then?: unknown
      env?: Record<string, unknown>
    }
    if (ctx && typeof ctx.then !== 'function' && ctx.env?.['HYPERDRIVE']) {
      return 'hyperdrive'
    }
  } catch {
    /* ignore */
  }
  return readEnv('DATABASE_URL') || readDatabaseUrl() ? 'direct' : 'missing'
}
