import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// On Cloudflare Workers there is no traditional Node process. We use
// Prisma's driver adapters with node-postgres (`pg`) over Workers' TCP
// sockets. DATABASE_URL must be the Supabase *pooled* connection string
// (port 6543, Transaction pooler / PgBouncer).

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function readEnv(name: string): string | undefined {
  // 1) Prefer Cloudflare bindings via OpenNext context (most reliable on Workers)
  try {
    const ctx = getCloudflareContext()
    const v = (ctx?.env as Record<string, unknown> | undefined)?.[name]
    if (typeof v === 'string' && v.length > 0) return v
  } catch {
    // getCloudflareContext throws outside a request scope — fall through
  }
  // 2) Fallback to process.env (works with nodejs_compat_populate_process_env)
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
  if (typeof p === 'string' && p.length > 0) return p
  return undefined
}

function createPrismaClient() {
  const connectionString = readEnv('DATABASE_URL')
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// Lazily create the client on first actual use (request time), so
// `next build` / route module import doesn't require the secret.
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
