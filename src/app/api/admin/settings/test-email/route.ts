import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { withSql } from '@/lib/sql'
import { requireSuperAdmin, authErrorResponse, getSession } from '@/lib/auth'
import { sendTemplatedEmail, fmtArDate } from '@/lib/email'
import { logAudit } from '@/lib/audit'
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/message-templates'

export const dynamic = 'force-dynamic'

/** يبعت رسالة تجريبية من القالب المختار لإيميل الأدمن نفسه — للتأكد إن Resend شغّال. */
async function __POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const session = await getSession()
  const body = await req.json().catch(() => ({}))
  const kind = TEMPLATE_KINDS.includes(body?.kind) ? (body.kind as TemplateKind) : 'welcome'
  const to = String(session?.email ?? '').trim()
  if (!to) return NextResponse.json({ error: 'مفيش إيميل لحساب الأدمن' }, { status: 400 })

  const r = await withSql((sql) =>
    sendTemplatedEmail(sql, kind, to, 'admin-test', {
      shopName: 'محل تجريبي', ownerName: 'أدمن', planName: 'باقة تجريبية', daysLeft: 3,
      endDate: fmtArDate(new Date(Date.now() + 3 * 86400000)),
    }),
  )
  await logAudit({ action: 'settings.test_email', targetType: 'settings', details: { kind, ok: r.ok, skipped: r.skipped } }, req)
  if (!r.ok) {
    const msg =
      r.skipped === 'no_api_key' ? 'مفتاح RESEND_API_KEY مش مضاف كـ Secret في الـ Worker'
      : r.skipped === 'disabled' ? 'الإيميلات متوقفة من الإعدادات'
      : r.skipped === 'daily_cap' ? 'وصلنا للحد اليومي للإرسال'
      : `فشل الإرسال (${r.error ?? r.skipped})`
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, to })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
