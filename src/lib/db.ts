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

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
