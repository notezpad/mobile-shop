import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { bumpEdgeCache } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

async function __GET() {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const where: any = { tenantId: s.tenantId }
  if (s.branchId) where.branchId = s.branchId
  // ⚡ PERF FIX (CPU time / Error 1102): this had NO `take` limit — every
  // stocktake session ever created for the tenant was loaded, each one WITH
  // its full item list (one row per counted product) and the product name/
  // barcode for every item. A shop that does regular stocktakes accumulates
  // these forever, so this endpoint got heavier every week — and it's
  // fetched on EVERY page load of /inventory (all 5 calls fire in parallel
  // regardless of which tab is open). Capped at the 200 most recent sessions,
  // which is what the UI renders anyway (no pagination/"load more" exists).
  const rows = await db.stocktake.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 200,
    include: {
      branch: { select: { name: true } },
      items: { include: { product: { select: { name: true, barcode: true } } } },
    },
  })
  // `createdBy` on Stocktake is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    createdByName: r.createdBy ? (userNameById.get(r.createdBy) ?? null) : null,
  }))
  return NextResponse.json(result)
}

async function __POST(req: NextRequest) {
  let s
  try {
    // 🛡️ 2026-09-30 (X8): اعتماد الجرد بيغيّر أرصدة المخزن فعلياً — أدمن بس.
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const b = await req.json().catch(() => null)
  const branchId = s.branchId ?? (b?.branchId ? parseInt(b.branchId, 10) : null)
  const items = Array.isArray(b?.items) ? b.items : []
  const commit = b?.commit === true
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للجرد' }, { status: 400 })
  // 🛡️ 2026-09-30 (X8): اعتماد الجرد من غير سبب كان بيقبل أي تغيير مجهول.
  if (commit) {
    const reason = b?.note ? String(b.note).trim() : ''
    if (reason.length < 3) {
      return NextResponse.json(
        { error: 'اكتب سبب/مرجع الجرد (إجباري عند الاعتماد — مثال: جرد نهاية الشهر)' },
        { status: 400 },
      )
    }
  }

  const productIds = items.map((it: any) => parseInt(it.productId, 10)).filter(Boolean)
  const products = await db.product.findMany({ where: { id: { in: productIds }, tenantId: s.tenantId } })
  const pMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))

  const created = await db.$transaction(async (tx) => {
    const st = await tx.stocktake.create({
      data: {
        tenantId: s.tenantId,
        branchId,
        status: commit ? 'committed' : 'draft',
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        committedAt: commit ? new Date() : null,
        items: {
          create: items.map((it: any) => {
            const pid = parseInt(it.productId, 10)
            const counted = parseInt(it.countedQty, 10) || 0
            // 🛡️ 2026-09-30 (X8): الكمية المعدودة سالب → مرفوضة. كانت بتتحفظ
            // كقيمة مطلقة في المخزن وبتكسر أرضية الصفر اللي باقي النظام بيحافظ عليها.
            if (counted < 0) {
              throw new StocktakeNegativeError(
                `الكمية المعدودة للمنتج "${pMap.get(pid)?.name ?? pid}" لا يمكن أن تكون سالبة`,
              )
            }
            const p = pMap.get(pid)
            const sys = p?.quantity ?? 0
            return { productId: pid, systemQty: sys, countedQty: counted, diff: counted - sys }
          }),
        },
      },
      include: { items: true },
    })
    if (commit) {
      for (const it of st.items) {
        if (it.diff !== 0) {
          await tx.product.update({ where: { id: it.productId }, data: { quantity: it.countedQty } })
          await tx.stockMovement.create({
            data: {
              tenantId: s.tenantId,
              branchId: branchId ?? null,
              productId: it.productId,
              type: 'stocktake',
              quantity: it.diff,
              refType: 'stocktake',
              refId: st.id,
              note: b?.note ? String(b.note).trim() : 'تسوية جرد',
              userId: s.userId,
            },
          })
        }
      }
    }
    return st
  })
  // ⚡ v9: تسوية الجرد بيسجل حركات — إبطال كاش الدفتر فوراً
  await bumpEdgeCache('/api/inventory/movements', s.tenantId)
  return NextResponse.json(created, { status: 201 })
}

class StocktakeNegativeError extends Error {}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(async () => {
    try {
      return await __POST(...args)
    } catch (e) {
      if (e instanceof StocktakeNegativeError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
  })
}
