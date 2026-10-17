import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { namesOfProductsWithVariants, variantGuardMessage } from '@/lib/variant-guard'
export const dynamic = 'force-dynamic'

async function __POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const st = await db.stocktake.findUnique({ where: { id: sid }, include: { items: true } })
  if (!st || st.tenantId !== s.tenantId) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  if (st.status === 'committed') return NextResponse.json({ ok: true, alreadyCommitted: true })
  // 🎨 اعتماد جرد بيكتب Product.quantity مباشرة — ممنوع على منتج له مقاسات/ألوان
  const vNames = await namesOfProductsWithVariants(db, st.items.filter((i) => i.diff !== 0).map((i) => i.productId))
  if (vNames.length) return NextResponse.json({ error: variantGuardMessage(vNames, 'اعتماد الجرد') }, { status: 400 })
  await db.$transaction(async (tx) => {
    for (const it of st.items) {
      if (it.diff !== 0) {
        // 🛡️ FIX (tsc): productId Int? — صفوف بقيت بعد حذف المنتج بتتسكب
        // (مفيش مخزون نعدّله لمنتج اتمسح).
        if (it.productId == null) continue
        await tx.product.update({ where: { id: it.productId }, data: { quantity: it.countedQty } })
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId, branchId: st.branchId ?? undefined, productId: it.productId,
            type: 'stocktake', quantity: it.diff, refType: 'stocktake', refId: st.id,
            note: 'تسوية جرد', userId: s.userId,
          },
        })
      }
    }
    await tx.stocktake.update({ where: { id: sid }, data: { status: 'committed', committedAt: new Date() } })
  })
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
