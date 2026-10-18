import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { applyTransferItem, validateVariantLines, TransferStockError } from '@/lib/transfer-stock'

export const dynamic = 'force-dynamic'

/** POST — commit a pending transfer (apply stock movements). */
async function __POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const tid = parseInt(id, 10)
  const t = await db.transfer.findUnique({
    where: { id: tid },
    include: { items: true, fromBranch: { select: { name: true } }, toBranch: { select: { name: true } } },
  })
  if (!t || t.tenantId !== s.tenantId) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  if (t.status !== 'pending') return NextResponse.json({ error: 'التحويل ليس معلّقاً' }, { status: 400 })
  if (s.branchId && t.fromBranchId !== s.branchId) {
    return NextResponse.json({ error: 'يمكن تنفيذ التحويل من فرع المصدر فقط' }, { status: 403 })
  }

  // 🎨 بنود التحويل المعلّق (منتج + لون/مقاس) — نتأكد إنها لسه صالحة
  const lines: Array<{ productId: number; variantId: number | null; quantity: number }> = []
  for (const it of t.items) {
    // 🛡️ FIX (tsc): productId Int? — صف تحويل لمنتج اتمسح = مفيش إيه يتتنفذ له
    if (it.productId == null) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
    lines.push({ productId: it.productId, variantId: it.variantId, quantity: it.quantity })
  }
  {
    const vErr = await validateVariantLines(db, s.tenantId, lines)
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 })
  }

  try {
    await db.$transaction(async (tx) => {
      // 🛡️ حجز ذري: ضغطتين على «تنفيذ» كانوا بينفّذوا التحويل مرتين (خصم/إضافة مضاعفة)
      const claimed = await tx.transfer.updateMany({
        where: { id: tid, tenantId: s.tenantId, status: 'pending' },
        data: { status: 'completed', completedAt: new Date() },
      })
      if (claimed.count !== 1) throw new TransferStockError('التحويل اتنفّذ بالفعل أو لم يعد معلّقاً', 409)
      const ctx = {
        tenantId: s.tenantId,
        userId: s.userId,
        transferId: t.id,
        from: { id: t.fromBranchId, name: t.fromBranch.name },
        to: { id: t.toBranchId, name: t.toBranch.name },
      }
      // الخصم الذري جوه applyTransferItem — لو أي بند ناقص كل الـ transaction بتتلغي
      // (بما فيها حجز الحالة) فالتحويل يفضل معلّق ويتنفّذ بعد توفير الكمية.
      for (const l of lines) await applyTransferItem(tx, ctx, l)
    })
  } catch (e) {
    if (e instanceof TransferStockError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  return NextResponse.json({ ok: true })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
