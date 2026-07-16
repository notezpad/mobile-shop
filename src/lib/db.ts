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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = readDatabaseUrl()

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a Cloudflare Worker runtime secret/variable, then redeploy with --keep-vars.',
    )
  }

  const adapter = new PrismaPg({ connectionString })
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
