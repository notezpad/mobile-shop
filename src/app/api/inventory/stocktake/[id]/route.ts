import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const st = await db.stocktake.findUnique({ where: { id: sid }, include: { items: true } })
  if (!st || st.tenantId !== s.tenantId) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  if (st.status === 'committed') return NextResponse.json({ ok: true, alreadyCommitted: true })
  await db.$transaction(async (tx) => {
    for (const it of st.items) {
      if (it.diff !== 0) {
        await tx.product.update({ where: { id: it.productId }, data: { quantity: it.countedQty } })
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId, branchId: st.branchId, productId: it.productId,
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
