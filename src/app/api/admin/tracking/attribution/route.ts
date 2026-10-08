import { withDb, db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { getAttribution, AttributionFilters } from '@/lib/tracking/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tracking/attribution
 *
 * تقارير الإسناد — أي مصدر/حملة يجلب العملاء المدفوعين فعلياً.
 * فلاتر: from/to · platform · source · medium · campaign · model (first|last)
 * ترتيب: sortBy (purchases|revenue|trials|conversion|registrations) · order (asc|desc)
 */
async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const sp = req.nextUrl.searchParams
  const iso = (v: string | null, fallback: string) => {
    if (!v) return fallback
    const d = new Date(v)
    return isNaN(d.getTime()) ? fallback : d.toISOString()
  }
  const now = new Date()

  const sortByRaw = sp.get('sortBy') ?? 'registrations'
  const sortBy = (['purchases', 'revenue', 'trials', 'conversion', 'registrations'].includes(sortByRaw)
    ? sortByRaw
    : 'registrations') as AttributionFilters['sortBy']

  const filters: AttributionFilters = {
    from: iso(sp.get('from'), new Date(now.getTime() - 30 * 864e5).toISOString()),
    to: iso(sp.get('to'), now.toISOString()),
    platform: sp.get('platform') || 'all',
    source: sp.get('source') || null,
    medium: sp.get('medium') || null,
    campaign: sp.get('campaign') || null,
    model: sp.get('model') === 'last' ? 'last' : 'first',
    sortBy,
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
    limit: Math.min(Number(sp.get('limit')) || 100, 500),
  }

  // 🛡️ لا يُرجع 500 أبداً — فشل الاستعلام يرجع صفوفاً فارغة + سبب واضح
  // يظهر في بانر الواجهة (نفس نمط شاشة الإعدادات).
  try {
    const rows = await getAttribution(db as any, filters)
    return NextResponse.json({ rows, filters, dataReady: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e).slice(0, 300)
    return NextResponse.json(
      { rows: [], filters, dataReady: false, errorDetail: detail },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
