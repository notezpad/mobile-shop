import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { invalidatePlanContextCache } from '@/lib/features'
import { ADDON_CATALOG, isAddOnKey, type AddOnKey } from '@/lib/addons'

export const dynamic = 'force-dynamic'

/**
 * 🧩 2026-11-04 (التحديث 25): إدارة الإضافات المدفوعة من لوحة الأدمن.
 *
 * GET  /api/admin/tenants/<id>/addons
 *   → كل صفوف الإضافات للمحل (نشطة ومنتهية) + الكتالوج.
 *
 * POST /api/admin/tenants/<id>/addons
 *   body: { action: 'grant', addOnKey, quantity?, endDate? }
 *     → منح يدوي (هدية/تسوية/دفع كاش برا النظام). endDate اختياري:
 *       الافتراضي = تاريخ انتهاء اشتراك المحل الشغّال (الإضافة بتعيش مع
 *       الباقة)، ولو مفيش اشتراك شغّال = +30 يوم من الآن.
 *   body: { action: 'revoke', addOnKey }
 *     → إلغاء كل الصفوف النشطة للإضافة دي فوراً (endDate = now).
 *
 * الفروق عن الشراء الذاتي عبر Paymob:
 *   - مش محتاج اشتراك مدفوع شغّال (الأدمن هو المتحكم).
 *   - التفعيل فوري + سجل تدقيق (AuditLog) + إبطال كاش سياق الباقة.
 */

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const rows = await db.tenantAddOn.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const catalog = (Object.keys(ADDON_CATALOG) as AddOnKey[]).map((k) => ({
    key: k,
    name: ADDON_CATALOG[k].name,
    unitLabel: ADDON_CATALOG[k].unitLabel,
    quantifiable: ADDON_CATALOG[k].quantifiable,
    maxQuantity: ADDON_CATALOG[k].maxQuantity,
  }))

  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      addOnKey: r.addOnKey,
      quantity: r.quantity,
      status: r.status,
      period: r.period,
      amountPaid: Number(r.amountPaid ?? 0),
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
      paymentMethod: r.paymentMethod,
      paymentNote: r.paymentNote,
    })),
    catalog,
  })
}

async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({ where: { id }, select: { id: true, shopName: true } })
  if (!tenant) return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })

  const action = String(body.action ?? '')
  const addOnKey = String(body.addOnKey ?? '')

  if (!isAddOnKey(addOnKey)) {
    return NextResponse.json({ error: 'الإضافة غير معروفة' }, { status: 400 })
  }
  const def = ADDON_CATALOG[addOnKey]

  // ── منح يدوي ─────────────────────────────────────────────────────
  if (action === 'grant') {
    const quantity = def.quantifiable
      ? Math.min(def.maxQuantity, Math.max(1, Math.floor(Number(body.quantity) || 1)))
      : 1

    let endDate: Date
    const parsedEnd = body.endDate ? new Date(String(body.endDate)) : null
    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      endDate = parsedEnd
    } else {
      // الافتراضي: تعيش مع اشتراك المحل الشغّال — وإلا +30 يوم
      const now = new Date()
      const liveSub = await db.subscription.findFirst({
        where: { tenantId: id, status: 'active', endDate: { gt: now } },
        orderBy: { endDate: 'desc' },
        select: { endDate: true },
      })
      endDate = liveSub?.endDate ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    }

    const row = await db.tenantAddOn.create({
      data: {
        tenantId: id,
        addOnKey,
        quantity,
        status: 'active',
        period: 'monthly',
        amountExpected: 0,
        amountPaid: 0,
        paymentMethod: 'admin_grant',
        paymentNote: `granted-by-admin`,
        startDate: new Date(),
        endDate,
      },
    })

    invalidatePlanContextCache(id)
    await logAudit({
      action: 'tenant.addon_grant',
      targetType: 'tenant',
      targetId: id,
      details: { addOnKey, quantity, endDate: endDate.toISOString(), shopName: tenant.shopName },
    }, req)

    return NextResponse.json({ ok: true, item: { id: row.id, endDate: endDate.toISOString() } })
  }

  // ── إلغاء فوري ───────────────────────────────────────────────────
  if (action === 'revoke') {
    const now = new Date()
    const cancelled = await db.tenantAddOn.updateMany({
      where: { tenantId: id, addOnKey, status: 'active', endDate: { gt: now } },
      data: { status: 'cancelled', endDate: now, paymentNote: 'revoked-by-admin' },
    })

    invalidatePlanContextCache(id)
    await logAudit({
      action: 'tenant.addon_revoke',
      targetType: 'tenant',
      targetId: id,
      details: { addOnKey, cancelled: cancelled.count, shopName: tenant.shopName },
    }, req)

    return NextResponse.json({ ok: true, cancelled: cancelled.count })
  }

  return NextResponse.json({ error: 'action لازم يكون grant أو revoke' }, { status: 400 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
