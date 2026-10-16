import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

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
  if (s.branchId) where.OR = [{ fromBranchId: s.branchId }, { toBranchId: s.branchId }]
  // ⚡ PERF FIX (CPU time / Error 1102): same issue as /api/inventory/stocktake
  // — no `take` limit, so every transfer ever made (each with its full item
  // list + product name/barcode) was loaded on every /inventory page open.
  // Capped at the 300 most recent transfers, matching how the UI actually
  // displays this list (no pagination exists to reach further back).
  const rows = await db.transfer.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 300,
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      items: { include: { product: { select: { name: true, barcode: true } } } },
    },
  })
  // `createdBy` on Transfer is a plain string (no Prisma relation defined),
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
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const b = await req.json().catch(() => null)
  const fromBranchId = parseInt(b?.fromBranchId, 10)
  const toBranchId = parseInt(b?.toBranchId, 10)
  const items = Array.isArray(b?.items) ? b.items : []
  const mode = b?.mode === 'pending' ? 'pending' : 'completed' // default: execute immediately
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return NextResponse.json({ error: 'اختر فرعين مختلفين' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للتحويل' }, { status: 400 })
  if (s.branchId && s.branchId !== fromBranchId) return NextResponse.json({ error: 'يمكنك التحويل من فرعك فقط' }, { status: 403 })

  const [fb, tb] = await Promise.all([
    db.branch.findUnique({ where: { id: fromBranchId } }),
    db.branch.findUnique({ where: { id: toBranchId } }),
  ])
  if (!fb || fb.tenantId !== s.tenantId || !tb || tb.tenantId !== s.tenantId)
    return NextResponse.json({ error: 'فرع غير صالح' }, { status: 400 })

  // Validate quantities first (only when about to execute)
  if (mode === 'completed') {
    for (const it of items) {
      const pid = parseInt(it.productId, 10)
      // 🥬 2026-10-12: الكمية Float — تحويل بالوزن (12.5 كيلو بين الفروع)
      const qty = Math.round((Number(it.quantity) || 0) * 1000) / 1000
      if (!pid || !qty || qty <= 0) return NextResponse.json({ error: 'بيانات أصناف غير صالحة' }, { status: 400 })
      const p = await db.product.findUnique({ where: { id: pid } })
      if (!p || p.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
      if (p.quantity + 1e-9 < qty) return NextResponse.json({ error: `الكمية غير متوفرة (${p.name} — متاح: ${Math.round(p.quantity * 1000) / 1000})` }, { status: 400 })
    }
  }

  const created = await db.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        tenantId: s.tenantId,
        fromBranchId, toBranchId,
        status: mode,
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        completedAt: mode === 'completed' ? new Date() : null,
        items: { create: items.map((it: any) => ({ productId: parseInt(it.productId,10), quantity: Math.round((Number(it.quantity) || 0) * 1000) / 1000 })) },
      },
      include: { items: true },
    })
    if (mode === 'pending') return t // just save the draft; no stock movement yet
    for (const it of t.items) {
      if (it.productId == null) throw new Error('منتج غير صالح') // 🛡️ FIX (tsc): productId Int?
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
