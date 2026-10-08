import { withDb, db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { getFunnel, getFunnelFallback, FunnelFilters, FunnelResult } from '@/lib/tracking/analytics'

export const dynamic = 'force-dynamic'

const EMPTY_FUNNEL: FunnelResult = {
  visitors: 0, registrations: 0, trials: 0, checkouts: 0, purchases: 0,
  steps: [
    { key: 'visitors', label: 'الزوار', count: 0, fromPrev: null },
    { key: 'registrations', label: 'التسجيلات', count: 0, fromPrev: null },
    { key: 'trials', label: 'التجارب', count: 0, fromPrev: null },
    { key: 'checkouts', label: 'بدء الدفع', count: 0, fromPrev: null },
    { key: 'purchases', label: 'المدفوعات', count: 0, fromPrev: null },
  ],
  overallFromVisitors: null,
  overallFromRegistrations: null,
}

/**
 * GET /api/admin/tracking/funnel
 *
 * القمع التحليلي: Visitors → Registrations → Trials → Checkouts → Purchases
 * فلاتر: from/to (ISO) · platform · source · medium · campaign · model (first|last)
 * قراءة فقط من بيانات التتبع الموجودة — لا تُغيّر شيئاً.
 *
 * 🛡️ لا يُرجع 500 أبداً: المسار الخام → احتياطي ORM → قيم فارغة +
 * dataReady=false + errorDetail (يظهر في بانر الواجهة مع خطوات الإصلاح).
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

  const filters: FunnelFilters = {
    from: iso(sp.get('from'), new Date(now.getTime() - 7 * 864e5).toISOString()),
    to: iso(sp.get('to'), now.toISOString()),
    platform: sp.get('platform') || 'all',
    source: sp.get('source') || null,
    medium: sp.get('medium') || null,
    campaign: sp.get('campaign') || null,
    model: sp.get('model') === 'last' ? 'last' : 'first',
  }

  // 1) المسار الأساسي — SQL الخام (الأدق: يدعم كل الفلاتر)
  try {
    const result = await getFunnel(db as any, filters)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (rawErr) {
    const detail = String(rawErr instanceof Error ? rawErr.message : rawErr).slice(0, 300)

    // 2) احتياطي ORM — أرقام حقيقية بدون فلاتر الإسناد (source/medium/campaign)
    if (!filters.source && !filters.medium && !filters.campaign) {
      try {
        const result = await getFunnelFallback(db as any, filters)
        return NextResponse.json(
          { ...result, degraded: true, errorDetail: detail },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      } catch (ormErr) {
        const ormDetail = String(ormErr instanceof Error ? ormErr.message : ormErr).slice(0, 300)
        return NextResponse.json(
          { ...EMPTY_FUNNEL, dataReady: false, errorDetail: `${detail} | ORM: ${ormDetail}` },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
    }

    // 3) فلاتر إسناد نشطة + فشل الخام → فارغ مع سبب واضح
    return NextResponse.json(
      { ...EMPTY_FUNNEL, dataReady: false, errorDetail: detail },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
