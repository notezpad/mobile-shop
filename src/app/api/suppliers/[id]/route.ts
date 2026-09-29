import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const supplier = await db.supplier.findUnique({
    where: { id: sid },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!supplier || supplier.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }

  // Compute aggregated totals
  const totalPurchases = supplier.purchaseOrders.reduce((s, x) => s + x.total, 0)
  const totalPaidPayments = supplier.payments.reduce((s, p) => s + p.amount, 0)
  const totalPaidOrders = supplier.purchaseOrders.reduce(
    (s, x) => s + (x.paid ?? 0),
    0
  )
  const totalPaid = totalPaidPayments + totalPaidOrders
  const totalDebt = supplier.purchaseOrders.reduce(
    (s, x) => s + Math.max(0, x.total - (x.paid ?? 0)),
    0
  )

  return NextResponse.json({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    balance: supplier.balance,
    createdAt: supplier.createdAt.toISOString(),
    purchaseOrders: supplier.purchaseOrders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      total: o.total,
      paid: o.paid,
      refunded: o.refunded,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        cost: it.cost,
        quantity: it.quantity,
        returnedQty: it.returnedQty,
      })),
    })),
    payments: supplier.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
    summary: {
      totalPurchases,
      totalPaid,
      totalDebt,
      balance: supplier.balance, // source of truth (amount we owe)
    },
  })
}

async function __PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.supplier.findUnique({ where: { id: sid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }
  const name = String(body.name ?? existing.name).trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  const updated = await db.supplier.update({
    where: { id: sid },
    data: {
      name,
      phone:
        body.phone !== undefined
          ? body.phone
            ? String(body.phone)
            : null
          : existing.phone,
    },
  })
  return NextResponse.json(updated)
}

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const sid = parseInt(id, 10)
  if (isNaN(sid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  // 🛡️ 2026-09-29: deleting a supplier used to be unconditional. The old FK
  // config then (a) CASCADE-deleted every supplier payment and (b) orphaned every
  // purchase order (supplierId → NULL) — the debt history simply disappeared and
  // no check looked at the balance. Now a supplier can be deleted only if it has
  // NO history and a zero balance. The check runs inside a transaction that
  // locks the supplier row (a concurrent purchase/payment takes a conflicting
  // lock via its FK), and the DB foreign keys are NO ACTION as a last line of
  // defence (see migration 20260929_purchase_returns_and_supplier_safety).
  type Blocked = { blocked: string }
  try {
    const result = await db.$transaction(async (tx): Promise<Blocked | null> => {
      const rows = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Supplier"
         WHERE "id" = ${sid} AND "tenantId" = ${session.tenantId}
           FOR UPDATE`
      if (rows.length === 0) return { blocked: '__404__' }

      const supplier = await tx.supplier.findUnique({ where: { id: sid } })
      if (!supplier) return { blocked: '__404__' }

      if (Math.abs(supplier.balance) > 0.005) {
        const amount = Math.abs(supplier.balance).toFixed(2)
        return {
          blocked:
            supplier.balance > 0
              ? `لا يمكن حذف المورد: عليك له رصيد ${amount}. سدّد الحساب أولاً.`
              : `لا يمكن حذف المورد: له عندك رصيد دائن ${amount}. سوِّ الحساب أولاً.`,
        }
      }

      // sequential on purpose: one connection per interactive transaction
      const orders = await tx.purchaseOrder.count({
        where: { supplierId: sid, tenantId: session.tenantId },
      })
      const payments = await tx.supplierPayment.count({
        where: { supplierId: sid, tenantId: session.tenantId },
      })
      if (orders > 0 || payments > 0) {
        return {
          blocked:
            'لا يمكن حذف المورد لأن له فواتير أو دفعات مسجلة، حذفه سيمسح سجل الحسابات. احتفظ به (رصيده صفر ولن يؤثر على شيء).',
        }
      }

      await tx.supplier.delete({ where: { id: sid } })
      return null
    })

    if (result?.blocked === '__404__') {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }
    if (result) {
      return NextResponse.json({ error: result.blocked }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'تعذّر حذف المورد' }, { status: 400 })
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
