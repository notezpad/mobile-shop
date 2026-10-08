/**
 * ⚡ SANDBOX DEMO ADAPTER (2026-10-08):
 * النسخة الأصلية بتختار بين '@prisma/client/wasm' (Cloudflare Workers)
 * و '@prisma/client' (Node). هنا في بيئة المعاينة المحلية بنستخدم
 * النسخة الافتراضية دايماً مع SQLite.
 */

export { PrismaClient } from '@prisma/client'
export type { PrismaClient as PrismaClientType } from '@prisma/client'
