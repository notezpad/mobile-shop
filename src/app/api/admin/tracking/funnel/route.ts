import { withDb, db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { getFunnel, FunnelFilters } from '@/lib/tracking/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tracking/funnel
 *
 * القمع التحليلي: Visitors → Registrations → Trials → Checkouts → Purchases
 * فلاتر: from/to (ISO) · platform · source · medium · campaign · model (first|last)
 * قراءة فقط من بيانات التتبع الموجودة — لا تُغيّر شيئاً.
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

  const result = await getFunnel(db as any, filters)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
