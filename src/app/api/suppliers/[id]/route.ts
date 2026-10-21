import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModulePermission, featureErrorResponse } from '@/lib/features'
import { purgeCatalogCaches } from '@/lib/edgeCache'

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
  try { requireModulePermission(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

  // 🆕 2026-10-22: قيود الرصيد (الافتتاحي + التسويات) — بيتعرضوا في كشف حساب
  // المورد كأول قيود موثّقة عند الترحيل من نظام قديم.
  const balanceEntries = await db.balanceEntry.findMany({
    where: { tenantId: session.tenantId, kind: 'supplier', refId: sid },
    orderBy: { createdAt: 'asc' },
    select: { id: true, delta: true, reason: true, createdBy: true, createdAt: true },
  })

  // 🛡️ 2026-09-30: كل الإجماليات بقت صافية ومتطابقة مع الرصيد (المصدر الصحيح):
  //
  //   إجمالي المشتريات (صافي) = Σ فواتير (مكتملة + مرتجعة جزئياً) − قيمة
  //                              المرتجعات من الفواتير المرتجعة جزئياً
  //                              (الفواتير المرتجعة بالكامل مستبعدة)
  //   إجمالي المرتجعات        = قيمة كل المرتجعات (للعرض)
  //   إجمالي المدفوع (صافي)   = دفعات مستقلة (غير الملغاة) + المدفوع على الفواتير
  //                             − المبالغ اللي رجعت لنا كاش من المرتجعات (refunded)
  //   إجمالي الدين            = إجمالي المشتريات الصافي − إجمالي المدفوع الصافي
  //                             = الرصيد بالظبط (نفس معادلة الـ ledger)
  //
  // قبل كده: totalPurchases كان بيحسب الفواتير المرتجعة، وtotalDebt كان
  // max(0, total − paid) لكل فاتورة — بيتجاهل المرتجعات والدفعات المستقلة
  // خالص، فكان مش بيطابق الرصيد أبداً.
  const n = (v: unknown) => Number(v ?? 0)
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

  let grossPurchases = 0
  let totalReturns = 0
  let totalPaidOrders = 0
  for (const o of supplier.purchaseOrders) {
    if (o.status === 'مرتجعة') continue // مرتجعة بالكامل → مستبعدة من المشتريات
    grossPurchases += n(o.total)
    // قيمة المرتجعات من الفاتورة دي (الكميات المرجعة × سعر شرائها)
    const returnedValue = o.items.reduce(
      (s, it) => s + n(it.returnedQty) * n(it.cost),
      0,
    )
    totalReturns += returnedValue
    totalPaidOrders += n(o.paid) - n(o.refunded)
  }
  const totalPurchases = Math.max(0, r2(grossPurchases - totalReturns))
  totalReturns = r2(totalReturns)

  // cancelled payments no longer count
  const totalPaidPayments = supplier.payments
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + n(p.amount), 0)
  const totalPaid = r2(Math.max(0, totalPaidPayments + totalPaidOrders))
  const totalDebt = r2(totalPurchases - totalPaid)

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
      paymentMethod: o.paymentMethod,
      refunded: o.refunded,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      // صافي قيمة المرتجعات من الفاتورة دي — الواجهة بتستخدمه في عمود "علينا"
      returnedValue: r2(
        o.items.reduce((s, it) => s + n(it.returnedQty) * n(it.cost), 0),
      ),
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
      status: p.status,
      cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    })),
    // 🆕 2026-10-22: قيود الرصيد الافتتاحي والتسويات (لعرضها في كشف الحساب)
    balanceEntries: balanceEntries.map((b) => ({
      id: b.id,
      delta: b.delta,
      reason: b.reason,
      createdBy: b.createdBy,
      createdAt: b.createdAt.toISOString(),
    })),
    summary: {
      totalPurchases, // صافي بعد المرتجعات
      totalReturns,
      totalPaid, // صافي بعد المبالغ المستردة
      totalDebt, // = الرصيد (نفس معادلة الـ ledger)
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
  try { requireModulePermission(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
  // ⚡ v9: مسح كاش الكتالوج بعد تعديل المورد
  await purgeCatalogCaches(session.tenantId, session.branchId)
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
  try { requireModulePermission(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
    // ⚡ v9: مسح كاش الكتالوج بعد حذف المورد
    await purgeCatalogCaches(session.tenantId, session.branchId)
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
