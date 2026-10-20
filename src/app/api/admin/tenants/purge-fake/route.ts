import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { findInactiveTrials, hardDeleteTenant } from '@/lib/admin-fake-tenants'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * حذف نهائي للحسابات الوهمية + ملف «جمهور استبعاد» لفيسبوك.
 * - السيرفر بيعيد التحقق إن كل حساب فعلاً بدون نشاط (منتجات/مبيعات/دفع) — أي حساب اتحرك بيتخطى.
 * - الملف: CSV بـ email,phone مهشّمين SHA-256 (Meta بتقبله مباشرة في Custom Audience).
 */
async function __POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 300) : []
  if (ids.length === 0) return NextResponse.json({ error: 'اختر حسابات للحذف' }, { status: 400 })

  const verified = await findInactiveTrials(ids, 300)
  const okIds = new Set(verified.map((v) => v.id))
  const skipped = ids.filter((id) => !okIds.has(id)).length

  const lines: string[] = ['email,phone']
  let deleted = 0
  let cancelledOnly = 0

  for (const t of verified) {
    const r = await hardDeleteTenant(t)
    if (r.csvLine) lines.push(r.csvLine)
    if (r.mode === 'deleted') deleted++
    else cancelledOnly++
  }

  await logAudit({ action: 'tenant.purge_fake', targetType: 'tenant', details: { requested: ids.length, deleted, cancelledOnly, skipped } }, req)
  return NextResponse.json({
    ok: true,
    deleted,
    cancelledOnly,
    skipped,
    audienceCsv: lines.join('\n'),
    audienceRows: lines.length - 1,
  })
}

export async function POST(req: NextRequest) {
  return withDb(() => __POST(req))
}
