import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const where: any = { tenantId: s.tenantId }
  if (s.branchId) where.OR = [{ fromBranchId: s.branchId }, { toBranchId: s.branchId }]
  const rows = await db.transfer.findMany({
    where,
    orderBy: { id: 'desc' },
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      items: { include: { product: { select: { name: true, barcode: true } } } },
    },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const b = await req.json().catch(() => null)
  const fromBranchId = parseInt(b?.fromBranchId, 10)
  const toBranchId = parseInt(b?.toBranchId, 10)
  const items = Array.isArray(b?.items) ? b.items : []
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return NextResponse.json({ error: 'اختر فرعين مختلفين' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للتحويل' }, { status: 400 })
  if (s.branchId && s.branchId !== fromBranchId) return NextResponse.json({ error: 'يمكنك التحويل من فرعك فقط' }, { status: 403 })

  const [fb, tb] = await Promise.all([
    db.branch.findUnique({ where: { id: fromBranchId } }),
    db.branch.findUnique({ where: { id: toBranchId } }),
  ])
  if (!fb || fb.tenantId !== s.tenantId || !tb || tb.tenantId !== s.tenantId)
    return NextResponse.json({ error: 'فرع غير صالح' }, { status: 400 })

  const created = await db.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        tenantId: s.tenantId,
        fromBranchId, toBranchId,
        status: 'completed',
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        completedAt: new Date(),
        items: { create: items.map((it: any) => ({ productId: parseInt(it.productId,10), quantity: parseInt(it.quantity,10) })) },
      },
      include: { items: true },
    })
    for (const it of t.items) {
      const srcProduct = await tx.product.findUnique({ where: { id: it.productId } })
      if (!srcProduct || srcProduct.tenantId !== s.tenantId) throw new Error('منتج غير صالح')
      if (it.quantity <= 0) throw new Error('كمية غير صالحة')
      if (srcProduct.quantity < it.quantity) throw new Error(`الكمية غير متوفرة (${srcProduct.name})`)
      // decrement source
      await tx.product.update({ where: { id: srcProduct.id }, data: { quantity: { decrement: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: fromBranchId, productId: srcProduct.id,
          type: 'transfer_out', quantity: -it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل إلى ${tb.name}`, userId: s.userId,
        },
      })
      // find or create matching product at destination (same name/barcode)
      let destProduct = await tx.product.findFirst({
        where: {
          tenantId: s.tenantId,
          branchId: toBranchId,
          OR: [
            srcProduct.barcode ? { barcode: srcProduct.barcode } : { name: srcProduct.name },
            { name: srcProduct.name },
          ],
        },
      })
      if (!destProduct) {
        // create dest product without duplicating barcode (barcode is globally unique)
        destProduct = await tx.product.create({
          data: {
            tenantId: s.tenantId,
            branchId: toBranchId,
            name: srcProduct.name,
            category: srcProduct.category,
            barcode: null,
            price: srcProduct.price,
            cost: srcProduct.cost,
            quantity: 0,
            minQuantity: srcProduct.minQuantity,
          },
        })
      }
      await tx.product.update({ where: { id: destProduct.id }, data: { quantity: { increment: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: toBranchId, productId: destProduct.id,
          type: 'transfer_in', quantity: it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل من ${fb.name}`, userId: s.userId,
        },
      })
    }
    return t
  })
  return NextResponse.json(created, { status: 201 })
}
