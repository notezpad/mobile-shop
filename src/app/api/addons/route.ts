import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { getSql } from '@/lib/sql'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { getPlanContext } from '@/lib/features'
import { ADDON_CATALOG, ADDON_ORDER, planIncludesHr, type AddOnKey } from '@/lib/addons'
import { readAddOnPrices } from '@/lib/addon-settings'
import { countableSubWhere } from '@/lib/subscription-status'

export const dynamic = 'force-dynamic'

/**
 * GET /api/addons
 *
 * 🧩 2026-11-04 (التحديث 25): حالة الإضافات المدفوعة للمحل الحالي —
 * بيلم كارت «إضافات الباقة» في الإعدادات:
 *   - الكتالوج + الأسعار الفعلية (بعد تجاوزات PlatformSetting).
 *   - باقتك الحالية (كود/نشاط) — عشان نعرف نعرض «مشمولة في باقتك» لـ HR.
 *   - هل عندك اشتراك مدفوع شغّال (الإضافات بتتباع للاشتراك المدفوع فقط).
 *   - صفوف الإضافات النشطة مجمعة: الكمية الكلية + أقرب تاريخ انتهاء بعيد.
 */
async function __GET() {
  let session
  try {
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json({ ok: true, isPlatform: true, items: [] })
  }

  const tenantId = session.tenantId
  const [ctx, prices, latestSub] = await Promise.all([
    getPlanContext(tenantId),
    readAddOnPrices(getSql()),
    db.subscription.findFirst({
      where: { tenantId, ...countableSubWhere },
      orderBy: { endDate: 'desc' },
      select: { status: true, period: true, endDate: true, plan: { select: { code: true } } },
    }),
  ])

  const now = new Date()
  const hasPaidSub =
    !!latestSub &&
    latestSub.status === 'active' &&
    latestSub.endDate > now &&
    latestSub.period !== 'trial'

  // صفوف الإضافات النشطة — مجمعة لكل مفتاح (الكمية بتتراكم، العرض بياخد أقصى endDate)
  const rows = await db.tenantAddOn.findMany({
    where: { tenantId, status: 'active', endDate: { gt: now } },
    orderBy: { endDate: 'desc' },
    select: { addOnKey: true, quantity: true, endDate: true, period: true, amountPaid: true },
  })

  const active = new Map<string, { quantity: number; endDate: string | null; period: string | null; amountPaid: number }>()
  for (const r of rows) {
    const key = r.addOnKey as AddOnKey
    if (!(ADDON_ORDER as string[]).includes(key)) continue
    const prev = active.get(key)
    active.set(key, {
      quantity: (prev?.quantity ?? 0) + Math.max(1, r.quantity),
      endDate: !prev?.endDate || r.endDate > new Date(prev.endDate) ? r.endDate.toISOString() : prev.endDate,
      period: prev?.period ?? r.period,
      amountPaid: (prev?.amountPaid ?? 0) + Number(r.amountPaid ?? 0),
    })
  }

  const items = ADDON_ORDER.map((key) => {
    const def = ADDON_CATALOG[key]
    const a = active.get(key) ?? null
    const daysLeft = a?.endDate
      ? Math.max(0, Math.ceil((new Date(a.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : null
    return {
      key,
      name: def.name,
      desc: def.desc,
      unitLabel: def.unitLabel,
      quantifiable: def.quantifiable,
      maxQuantity: def.maxQuantity,
      priceMonthly: prices[key].monthly,
      priceYearly: prices[key].yearly,
      // included = الباقة الاحترافية فيها HR أصلاً (مش محتاج شراء)
      included: key === 'hr' && planIncludesHr(latestSub?.plan?.code),
      active: !!a,
      quantity: a?.quantity ?? 0,
      endDate: a?.endDate ?? null,
      daysLeft,
      period: a?.period ?? null,
    }
  })

  return NextResponse.json({
    ok: true,
    planCode: latestSub?.plan?.code ?? null,
    businessType: ctx.businessType,
    hasPaidSub,
    subEndDate: latestSub?.endDate ? latestSub.endDate.toISOString() : null,
    items,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
