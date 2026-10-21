import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { matchEdgeCache, putEdgeCache, purgeCatalogCaches } from '@/lib/edgeCache'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` — on Cloudflare Workers reuses ONE
 * PrismaClient per request instead of creating a new TCP+TLS+auth connection
 * per query. GET makes 2 parallel queries; without `withDb` each was 200-500ms
 * of pure connection overhead.
 *
 * 🛡️ 2026-09-27: Same unbounded-scan shape as /api/customers — no `take`
 * limit at all. See the comment there for the full rationale: every current
 * caller (SuppliersView's table, purchase-order picker, offline prewarm)
 * keeps calling this with NO `page` param and gets the same bare array as
 * before, since SuppliersView's stats/export also need the full set in
 * memory — just now bounded by SAFETY_CAP instead of truly unbounded.
 * `page` + `limit` params opt into real pagination — { data, total, page,
 * limit, totalPages } — for whoever adopts it later. No current page does.
 */
const SAFETY_CAP = 3000

export async function GET(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(session, 'suppliers')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const where: any = { tenantId: session.tenantId }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const paginated = searchParams.has('page')

    // ⚡ v9: كاش حافة لقائمة الموردين الافتراضية (بدون بحث/صفحات) —
    // استدعاء شاشة الموردين المتكرر بيرجع من الحافة بلا CPU. TTL 30 ثانية
    // + أي إضافة/تعديل/حذف بيمسح فوراً.
    const cacheable = !search && !paginated
    if (cacheable) {
      const hit = await matchEdgeCache('/api/suppliers', '', session.tenantId, '3')
      if (hit) return hit
    }
    const limit = paginated
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      : SAFETY_CAP
    const page = paginated ? Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)) : 1
    const skip = paginated ? (page - 1) * limit : 0

    // 🛡️ 2026-09-30: الإجماليات بقت صافية:
 //   إجمالي المشتريات = فواتير (مكتملة + مرتجعة جزئياً) − قيمة المرتجعات بتاعة
 //   الفواتير المرتجعة جزئياً (الفواتير المرتجعة بالكامل مستبعدة أصلاً).
 //   قبل كده الـ groupBy كان بيحسب كل الفواتير حتى المرتجعة، فالرقم كان مضخّم.
 //   نفس معادلة /api/reports بالظبط (marketplace واحدة للحسابات).
    const [suppliers, total, purchasesAgg, partialReturnsAgg] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy: { id: 'desc' },
        include: { _count: { select: { purchaseOrders: true } } },
        skip,
        take: limit,
      }),
      paginated ? db.supplier.count({ where }) : Promise.resolve(null),
      db.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: {
          tenantId: session.tenantId,
          supplierId: { not: null },
          status: { in: ['مكتملة', 'مرتجعة جزئياً'] },
        },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      db.purchaseReturn.groupBy({
        by: ['supplierId'],
        where: {
          tenantId: session.tenantId,
          purchaseOrder: { status: 'مرتجعة جزئياً' },
        },
        _sum: { total: true },
      }),
    ])
    const n = (v: unknown) => Number(v ?? 0)
    const aggBySupplier = new Map<
      number,
      { totalPurchases: number; lastPurchaseAt: Date | null }
    >(
      purchasesAgg.map((a) => {
        const gross = n(a._sum.total)
        const ret = n(
          partialReturnsAgg.find((r) => r.supplierId === a.supplierId)?._sum.total,
        )
        return [
          a.supplierId as number,
          {
            totalPurchases: Math.max(0, Math.round((gross - ret) * 100) / 100),
            lastPurchaseAt: a._max.createdAt,
          },
        ]
      }),
    )
    const result = suppliers.map((s) => ({
      ...s,
      totalPurchases: aggBySupplier.get(s.id)?.totalPurchases ?? 0,
      lastPurchaseAt: aggBySupplier.get(s.id)?.lastPurchaseAt ?? null,
    }))

    if (!paginated) {
      const supRes = NextResponse.json(result)
      if (cacheable) {
        await putEdgeCache(supRes.clone(), '/api/suppliers', '', session.tenantId, 30, '3')
      }
      return supRes
    }
    return NextResponse.json({
      data: result,
      total: total ?? result.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((total ?? result.length) / limit)),
    })
  })
}

export async function POST(req: NextRequest) {
  // 🛡️ 2026-10-22 (مراجعة): withIdempotency — نفس نمط /api/cash؛ إعادة إرسال
  // نفس المفتاح بعد انقطاع بترجّع الرد الأصلي بدل مورد مكرّر بنفس الرصيد.
  return withIdempotency(req, () => withDb(() => __POST(req)))
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    // 🛠️ 2026-10-22 (مراجعة): الكتابة هنا كانت بتفحص قراءة الموديول فقط —
    // موظف قراءة بس كان يقدر ينشئ موردين. بقى فحص كتابة زي /api/customers بالظبط.
    requireModuleWritePermission(session, 'suppliers')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }

  // 🆕 2026-10-22: رصيد افتتاحي — مستحقات المحل القديمة للمورد بتدخل كأول
  // قيد موثّق في كشف حسابه. حركة دفاتر محضة (BalanceEntry) — مفيش CashEntry.
  // 🛠️ 2026-10-22 (مراجعة): الافتتاحي أدمن فقط + تدقيق AuditLog إلزامي —
  // ونفس حماية مسار العملاء: قبل كده POST كان بيكتفى بفحص قراءة الموديول
  // بدون صلاحية كتابة أصلاً (requireModule فقط بدون requireModuleWritePermission).
  let openingBalance = 0
  if (body.openingBalance !== undefined && body.openingBalance !== null && String(body.openingBalance).trim() !== '') {
    openingBalance = Number(body.openingBalance)
    if (!Number.isFinite(openingBalance)) {
      return NextResponse.json({ error: 'الرصيد الافتتاحي غير صالح' }, { status: 400 })
    }
    openingBalance = Math.round((openingBalance + Number.EPSILON) * 100) / 100
    if (Math.abs(openingBalance) > 999999999) {
      return NextResponse.json({ error: 'الرصيد الافتتاحي خارج النطاق المسموح' }, { status: 400 })
    }
    if (Math.abs(openingBalance) >= 0.005 && session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'الرصيد الافتتاحي للأدمن فقط — اطلب من مدير المحل إدخاله أو سجّل المورد بدون رصيد' },
        { status: 403 },
      )
    }
  }
  const openingNote =
    body.openingBalanceNote ? String(body.openingBalanceNote).trim().slice(0, 300) : ''

  let created
  if (Math.abs(openingBalance) < 0.005) {
    created = await db.supplier.create({
      data: {
        tenantId: session.tenantId,
        name: String(body.name).trim(),
        phone: body.phone ? String(body.phone).trim() : null,
      },
    })
  } else {
    // معاملة واحدة: المورد + قيد الافتتاح + سطر تدقيق + ضبط الرصيد — إما الكل أو ولا حاجة
    created = await db.$transaction(async (tx) => {
      const s = await tx.supplier.create({
        data: {
          tenantId: session.tenantId,
          name: String(body.name).trim(),
          phone: body.phone ? String(body.phone).trim() : null,
        },
      })
      const reason = openingNote || 'رصيد افتتاحي — ترحيل من النظام القديم'
      const entry = await tx.balanceEntry.create({
        data: {
          tenantId: session.tenantId,
          kind: 'supplier',
          refId: s.id,
          delta: openingBalance,
          reason,
          createdBy: session.name || session.email || null,
        },
      })
      // 🛠️ تدقيق ذري (fatal) — الافتتاحي حركة مالية مش بتنعمل بدون أثر
      await logAudit(
        {
          action: 'balance.opening',
          targetType: 'supplier',
          targetId: String(s.id),
          details: {
            tenantId: session.tenantId,
            entryId: entry.id,
            delta: openingBalance,
            before: 0,
            after: openingBalance,
            reason,
          },
          actor: { id: String(session.userId ?? ''), email: session.email },
        },
        undefined,
        { tx, fatal: true },
      )
      return tx.supplier.update({ where: { id: s.id }, data: { balance: openingBalance } })
    })
  }
  // ⚡ v9: مسح كاش الكتالوج بعد إضافة مورد
  await purgeCatalogCaches(session.tenantId, session.branchId)
  return NextResponse.json(created, { status: 201 })
}
