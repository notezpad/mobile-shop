/**
 * ⚡ SANDBOX DEMO ADAPTER (2026-10-08):
 * هذا الملف نسخة تجريبية لبيئة المعاينة (SQLite) — النسخة الأصلية
 * للموقع الحقيقي تعمل على PostgreSQL + Cloudflare Workers (pg-cloudflare
 * + Hyperdrive + per-request clients).
 *
 * هنا: عميل Prisma واحد بـ SQLite يكفي تماماً لوضع التطوير المحلي.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const devClient: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = devClient

/** The single shared Prisma client (demo mode). */
export const db: PrismaClient = devClient

/**
 * In production (Cloudflare) this wraps the handler so the whole request
 * shares exactly ONE PrismaClient. In the sandbox (Node dev) it's a no-op.
 */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}

/** Exposed for diagnostics. */
export function describeDbConnection(): 'sqlite-local' {
  return 'sqlite-local'
}
