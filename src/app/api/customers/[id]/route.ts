import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

/** ⚡ EDGE CACHE purge بعد أي تعديل/حذف عميل */
async function purgeCustomerCaches(tenantId: number | string) {
  await purgeEdgeCache(
    [PURGE_KEYS.customersDefault, PURGE_KEYS.dashboard(7), PURGE_KEYS.dashboard(14), PURGE_KEYS.dashboard(30)],
    tenantId,
    2
  )
}

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
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const customer = await db.customer.findUnique({
    where: { id: cid },
    include: {
      sales: {
        orderBy: { createdAt: 'desc' },
        include: { items: true, payments: true },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      saleReturns: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!customer || customer.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }

  // 🛡️ 2026-09-30 (C6): ملخص صافي — نفس موك ملخص المورد بالظبط.
  // قبل كده: totalPurchases كان بيحسب الفواتير المرتجعة، وtotalPaid كان
  // بيرجّع الدفعات المرتبطة بالفواتير مرتين (الدفعة محسوبة في Sale.paid
  // وبرضه كدفعة مستقلة)، وtotalDebt كان بيدخل فواتير مرتجعة (الـ total
  // عليها قائم والـ paid صفّر بعد الحذف). دلوقتي:
  //   - الفواتير المرتجعة بالكامل مستبعدة من كل الإجماليات
  //   - مرتجعات البيع (SaleReturn) بتتخصم من المشتريات
  //   - المرتجعات الجزئية بتتصافى من كل فاتورة عبر refunded والـ SalePayment
  //   - الديون المعروضة = الرصيد المخزّن نفسه (مصدر الحقيقة)
  const activeSales = customer.sales.filter((s) => s.status !== 'مرتجعة')
  const activePayments = customer.payments.filter((p) => p.status !== 'cancelled')

  const grossPurchases = activeSales.reduce((s, x) => s + x.total, 0)
  const totalReturns = customer.saleReturns.reduce((s, r) => s + r.total, 0)
  const totalPurchases = Math.max(0, grossPurchases - totalReturns)

  // المدفوع الصافي: (المدفوع وقت البيع − المسترد − الدفعات المرتبطة) + دفعات الحساب المستحقة
  // (الدفعات المرتبطة محسوبة جوه Sale.paid — بنخصمها هنا عشان ما تتحسبش مرتين مع دفعات الحساب).
  const linkedTotal = activeSales.reduce(
    (s, x) => s + x.payments.reduce((ps, sp) => ps + sp.amount, 0),
    0,
  )
  const saleTimePaid = activeSales.reduce(
    (s, x) => s + Math.max(0, x.paid - x.refunded),
    0,
  )
  const accountPayments = activePayments.reduce((s, p) => s + p.amount, 0)
  const totalPaid = Math.max(0, saleTimePaid - linkedTotal) + accountPayments

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    balance: customer.balance,
    creditLimit: customer.creditLimit,
    createdAt: customer.createdAt.toISOString(),
    sales: customer.sales.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      total: s.total,
      paid: s.paid,
      status: s.status,
      dueDate: s.dueDate ? s.dueDate.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      items: s.items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        returnedQty: it.returnedQty,
        cost: it.cost,
      })),
    })),
    payments: customer.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      note: p.note,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
    returns: customer.saleReturns.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      total: r.total,
      refund: r.refund,
      creditApplied: r.creditApplied,
      createdAt: r.createdAt.toISOString(),
    })),
    summary: {
      totalPurchases,
      totalReturns,
      totalPaid,
      // 🛡️ الرصيد المخزّن هو مصدر الحقيقة — الديون المعروضة هي هو.
      totalDebt: customer.balance,
      balance: customer.balance,
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
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.customer.findUnique({ where: { id: cid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }
  const name = String(body.name ?? existing.name).trim()
  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  // 🛡️ 2026-09-30 (M10): الحد الائتماني اختياري — null/'' يمسحه، رقم سالب مرفوض.
  let creditLimit = existing.creditLimit
  if (body.creditLimit !== undefined) {
    if (body.creditLimit === null || body.creditLimit === '') {
      creditLimit = null
    } else {
      const cl = Number(body.creditLimit)
      if (!Number.isFinite(cl) || cl < 0) {
        return NextResponse.json({ error: 'الحد الائتماني غير صالح' }, { status: 400 })
      }
      creditLimit = cl
    }
  }
  const updated = await db.customer.update({
    where: { id: cid },
    data: {
      name,
      phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : existing.phone,
      creditLimit,
    },
  })
  await purgeCustomerCaches(session.tenantId)
  return NextResponse.json(updated)
}

/**
 * 🛡️ 2026-09-30 (C7 — قرار تجاري: ممنوع نهائياً): حذف عميل ليه سجل مالي
 * بيمسح الدين وسجل الدفعات بالكامل — اتقفل بالكامل، نفس موك حذف المورد:
 *   1. أدمن بس.
 *   2. قفل صف العميل (SELECT … FOR UPDATE) عشان مفيش بيع متزامن يحصل
 *      بين فحص الرصيد والحذف.
 *   3. ممنوع الحذف لو الرصيد ≠ 0 (مديونية أو رصيد دائن للعميل).
 *   4. ممنوع الحذف لو له أي فواتير أو دفعات أو مرتجعات (سجل مالي).
 *   5. FK بقى NoAction في الداتابيز كضمانة أخيرة (ميجريشن 20260930).
 * عملياً: الحذف ممكن بس لعميل جديد ما ليه أي حركة خالص.
 */
async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const cid = parseInt(id, 10)
  if (isNaN(cid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  try {
    await db.$transaction(async (tx) => {
      // 0. Lock the customer row — no concurrent sale/payment can slip in
      //    between the balance check and the delete.
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Customer"
         WHERE "id" = ${cid} AND "tenantId" = ${session.tenantId}
         FOR UPDATE`
      if (locked.length === 0) {
        throw new CustomerDeleteError('العميل غير موجود', 404)
      }

      const customer = await tx.customer.findUnique({
        where: { id: cid },
        select: {
          id: true,
          name: true,
          balance: true,
          _count: { select: { sales: true, payments: true, saleReturns: true } },
        },
      })
      if (!customer) throw new CustomerDeleteError('العميل غير موجود', 404)

      // 1. رصيد ≠ 0 → ممنوع (قرار تجاري: ممنوع نهائياً — مهما كانت الصلاحية).
      if (Math.abs(customer.balance) > 0.005) {
        throw new CustomerDeleteError(
          customer.balance > 0
            ? `العميل ${customer.name} عليه مديونية (${customer.balance.toFixed(2)}) — صفّي الحساب الأول (تحصيل أو مرتجع) قبل الحذف`
            : `العميل ${customer.name} له رصيد دائن (${Math.abs(customer.balance).toFixed(2)} لصالحه) — ارجع له الفلوس أو اخصمها قبل الحذف`,
          409,
        )
      }

      // 2. له سجل فواتير/دفعات/مرتجعات → ممنوع (التاريخ المالي ميتمسحش).
      const { sales, payments, saleReturns } = customer._count
      if (sales > 0 || payments > 0 || saleReturns > 0) {
        throw new CustomerDeleteError(
          `العميل ${customer.name} له سجل مالي (${sales} فاتورة، ${payments} دفعة، ${saleReturns} مرتجع) — لا يمكن حذفه حفاظاً على سلامة الحسابات`,
          409,
        )
      }

      await tx.customer.delete({ where: { id: cid } })
    })
    await purgeCustomerCaches(session.tenantId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof CustomerDeleteError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    // FK NoAction من الداتابيز كضمانة أخيرة (سجل اتحقن بين الفحص والحذف)
    return NextResponse.json(
      { error: 'تعذّر حذف العميل — غالباً ليه سجل مالي مرتبط بيه' },
      { status: 409 },
    )
  }
}

class CustomerDeleteError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CustomerDeleteError'
    this.status = status
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
