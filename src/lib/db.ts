import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// On Cloudflare Workers there is no traditional Node process, so we can't
// rely on Prisma's default query engine binary. Instead we use the
// "driver adapters" feature with node-postgres (`pg`), which talks to
// Supabase's Postgres over the TCP sockets Workers now expose.
//
// IMPORTANT: point DATABASE_URL at Supabase's *pooled* connection string
// (port 6543, the "Transaction" pooler / PgBouncer) — a single Worker can
// spin up many isolated invocations, and a pooler prevents you from
// exhausting Postgres' connection limit the way a direct connection would.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// IMPORTANT: don't instantiate PrismaClient at module load time.
// Next.js imports route modules during the build (page-data collection)
// step even for routes marked `force-dynamic`, and Cloudflare Workers'
// build environment does not expose runtime secrets/vars. Creating the
// client eagerly here throws "DATABASE_URL is not set" during `next build`.
// Instead we lazily create it on first actual use (i.e. at request time),
// via a Proxy so all 42+ existing `import { db } from '@/lib/db'` call
// sites keep working unchanged.
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
