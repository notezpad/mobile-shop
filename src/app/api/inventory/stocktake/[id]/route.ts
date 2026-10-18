import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { applyStocktakeDiff } from '@/lib/stocktake-stock'
export const dynamic = 'force-dynamic'

async function __POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  // 🛡️ اعتماد الجرد بيغيّر أرصدة المخزن — أدمن بس (زي إنشاء الجرد المعتمد)
  try { s = await requireAdmin() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const st = await db.stocktake.findUnique({ where: { id: sid }, include: { items: true } })
  if (!st || st.tenantId !== s.tenantId) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  if (st.status === 'committed') return NextResponse.json({ ok: true, alreadyCommitted: true })
  class AlreadyCommitted extends Error {}
  try {
    await db.$transaction(async (tx) => {
      // 🛡️ حجز ذري: ضغطتين/طلبين متزامنين ما يطبّقوش الجرد مرتين
      const claimed = await tx.stocktake.updateMany({
        where: { id: sid, tenantId: s.tenantId, status: { not: 'committed' } },
        data: { status: 'committed', committedAt: new Date() },
      })
      if (claimed.count !== 1) throw new AlreadyCommitted()
      for (const it of st.items) {
        // 🛡️ FIX (tsc): productId Int? — صفوف بقيت بعد حذف المنتج بتتسكب
        // (مفيش مخزون نعدّله لمنتج اتمسح).
        if (it.productId == null) continue
        await applyStocktakeDiff(
          tx,
          { tenantId: s.tenantId, userId: s.userId, branchId: st.branchId, stocktakeId: st.id, note: 'تسوية جرد' },
          { productId: it.productId, variantId: it.variantId, diff: it.diff },
        )
      }
    })
  } catch (e) {
    if (e instanceof AlreadyCommitted) return NextResponse.json({ ok: true, alreadyCommitted: true })
    throw e
  }
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
