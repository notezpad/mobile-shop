// Prisma client factory that supports both SQLite (local dev) and Postgres
// (production / Supabase). The connection string is detected at runtime:
//   - "file:..."           → SQLite, uses the default PrismaClient (no adapter)
//   - "postgresql://..."   → Postgres, uses the PrismaPg driver adapter
//
// On Cloudflare Workers there is no traditional Node process. When using
// Postgres we use Prisma's driver adapter with `pg` over Workers' TCP sockets
// (the `pg-cloudflare` import patches pg to use Workers-compatible sockets).
//
// IMPORTANT: we intentionally do NOT cache the PrismaClient in a module-level
// global across requests on Cloudflare Workers. Workers forbids reusing an
// I/O object (like a TCP socket opened by `pg`) that was created during one
// request inside a *different* request. We open a fresh connection per request.
// For SQLite (local dev / Node), caching is fine and avoids reconnect overhead.

import { PrismaClient } from '@prisma/client'
import { readDatabaseUrl } from './env'

let _sqliteClient: PrismaClient | null = null

function isSqlite(url: string): boolean {
  return url.startsWith('file:')
}

function createPrismaClient(): PrismaClient {
  const connectionString = readDatabaseUrl()

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  // SQLite path — uses the default PrismaClient with the built-in SQLite driver
  if (isSqlite(connectionString)) {
    if (!_sqliteClient) {
      _sqliteClient = new PrismaClient({
        log: ['error', 'warn'],
      })
    }
    return _sqliteClient
  }

  // Postgres path — use the driver adapter (with pg-cloudflare for Workers)
  // Imported dynamically so SQLite-only environments don't need pg installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require('@prisma/adapter-pg')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('pg-cloudflare')
  const adapter = new PrismaPg({ connectionString, max: 1 })
  return new PrismaClient({ adapter })
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = createPrismaClient()
    return Reflect.get(client as object, prop, receiver)
  },
})
