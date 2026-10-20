import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { extractRequestContext } from '@/lib/tracking/server'

/**
 * 🛡️ 2026-10-20 — Audit Log للأدمن.
 * - بتسجّل: مين (actor) عمل إيه (action) على إيه (target) ومتى، + hash للـ IP.
 * - ممنوع تمرير أسرار/كلمات مرور/توكنات في details (الدالة بتشيل أي مفتاح اسمه
 *   يشبه password/secret/token وبتقصّ النص الطويل).
 * - لا تكسر العملية الأصلية أبدًا: أي فشل (حتى لو الجدول لسه ما اتعملش) بيتتجاهل.
 */
const SECRET_KEY_RE = /pass(word)?|secret|token|authorization|cookie/i
const MAX_DETAILS = 2000

function scrub(v: unknown, depth = 0): unknown {
  if (v == null || depth > 3) return v ?? null
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v
  if (typeof v !== 'object') return v
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrub(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? '[hidden]' : scrub(val, depth + 1)
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface AuditInput {
  action: string
  targetType?: string
  targetId?: string | number | null
  details?: unknown
  /** لو الجلسة مش موجودة (مثلاً أثناء تسجيل الدخول) نمرّر الفاعل يدويًا */
  actor?: { id?: string | null; email?: string | null }
}

export async function logAudit(input: AuditInput, req?: { headers: Headers }): Promise<void> {
  try {
    let actorId = input.actor?.id ?? null
    let actorEmail = input.actor?.email ?? null
    if (!actorId && !actorEmail) {
      const s = await getSession()
      actorId = s?.userId ?? null
      actorEmail = s?.email ?? null
    }
    const ip = req ? extractRequestContext(req.headers).clientIp : undefined
    const ipHash = ip ? await sha256Hex(`audit-ip:${ip}`) : null
    let details: string | null = null
    if (input.details !== undefined) {
      details = JSON.stringify(scrub(input.details))
      if (details.length > MAX_DETAILS) details = details.slice(0, MAX_DETAILS)
    }
    await db.$executeRaw`
      INSERT INTO "AuditLog" ("actorId","actorEmail","action","targetType","targetId","details","ipHash")
      VALUES (${actorId}, ${actorEmail}, ${input.action}, ${input.targetType ?? null},
              ${input.targetId == null ? null : String(input.targetId)}, ${details}, ${ipHash})`
  } catch (e) {
    console.error('[audit] failed (ignored):', e)
  }
}
