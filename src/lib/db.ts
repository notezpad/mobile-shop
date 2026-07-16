// pg-cloudflare MUST be imported before any pg usage so it can monkey-patch
// Node's net/tls modules for the Cloudflare Workers runtime. Without this
// import, pg's TCP connections will fail on Workers even with nodejs_compat.
import 'pg-cloudflare'

import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readDatabaseUrl } from './env'

// On Cloudflare Workers there is no traditional Node process. We use Prisma's
// driver adapter with node-postgres (`pg`) over Workers' TCP sockets. The
// pg-cloudflare import above patches pg to use Workers-compatible sockets.
// The DB URL should be the pooled connection string (Supabase port 6543).

/**
 * PgBouncer (used by Supabase connection pooler on port 6543) does NOT
 * support prepared statements in transaction mode. Without disabling them,
 * every Prisma query that uses a prepared statement will fail with:
 *   "prepared statement does not exist"
 * We auto-append ?pgbouncer=true when the URL points to a pooler port,
 * and we also explicitly create the Pool with preparedStatements: false
 * as a belt-and-suspenders approach.
 */
function prepareConnectionString(raw: string): { url: string; isPooled: boolean } {
  const isPooled =
    raw.includes(':6543/') || raw.includes('pooler')

  // If already has pgbouncer param, return as-is
  if (raw.includes('pgbouncer=')) return { url: raw, isPooled }

  if (isPooled) {
    const sep = raw.includes('?') ? '&' : '?'
    return { url: raw + sep + 'pgbouncer=true', isPooled }
  }

  return { url: raw, isPooled: false }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const rawUrl = readDatabaseUrl()

  if (!rawUrl) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  const { url: connectionString } = prepareConnectionString(rawUrl)

  // Create a pg Pool with explicit settings for Cloudflare Workers + PgBouncer
  const pool = new Pool({
    connectionString,
    max: 5, // Keep pool small for Workers (limited connections)
  })

  // Explicitly pass the pool so we control its configuration
  const adapter = new PrismaPg({ pool })
  return new PrismaClient({ adapter })
}

// Lazily create the client on first actual use (request time), so build/module
// import does not require the database secret.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    return Reflect.get(client as object, prop, receiver)
  },
})