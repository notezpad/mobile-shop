import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { createPrincipalCashEntry } from '@/lib/commission'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

class SaleOverpaid extends Error {}

const VALID_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

async function __GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // saleh-mowazaf: module 'customers'
  try { await requireModule(session, 'customers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { searchParams } = new URL(req.url)
  const customerIdRaw = searchParams.get('customerId')
  const customerId = customerIdRaw ? parseInt(customerIdRaw, 10) : NaN
  if (isNaN(customerId)) {
    return NextResponse.json(
      { error: 'معرف العميل مطلوب' },
      { status: 400 }
    )
  }
  // verify the customer belongs to the tenant
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, tenantId: true },
  })
  if (!customer || customer.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
  }

  // 🛡️ 2026-09-27: safety cap — this was unbounded. Scoped to one customer
  // so the realistic ceiling is much lower than /api/customers, but a
  // long-lived customer with years of small payments could still grow this
  // without bound. Most recent 500 is effectively unlimited in practice.
  const payments = await db.payment.findMany({
    where: { tenantId: session.tenantId, customerId },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json(payments)
}

/**
 * 🛡️ 2026-09-15 (v3): Customer payment — Bug #9 + #11 + CashEntry.method fix.
 *
 * Bug #9 fix: Commission logic was using a NEGATIVE amount (-commission) in
 *   this route but a POSITIVE amount (+commission) in finance/route.ts.
 *   Now both use the unified `recordCommission()` helper which always
 *   creates a POSITIVE commission entry (revenue, not expense).
 *
 * Bug #11 fix: Wasn't linking the payment to a Sale.paid. Now accepts an
 *   optional `saleId` body parameter. When provided:
 *   - Creates a `SalePayment` row (linked via cashEntryId to the CashEntry)
 *   - Increments `Sale.paid` so the sale record stays in sync
 *   - When DELETE sale runs later, it can reverse this payment via the
 *     SalePayment.cashEntryId link
 *
 * Bug #22 fix: CashEntry.method column is now populated so the drawer
 *   aggregation can split by method.
 */
async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // saleh-kateb-mowazaf: module 'customers'
  try { requireModuleWritePermission(session, 'customers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  // customerId required & must belong to tenant
  const customerId = parseInt(body.customerId, 10)
  if (isNaN(customerId)) {
    return NextResponse.json(
      { error: 'معرف العميل مطلوب' },
      { status: 400 }
    )
  }
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  })
  if (!customer || customer.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'العميل غير موجود في هذا المحل' },
      { status: 404 }
    )
  }

  // amount > 0
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'المبلغ يجب أن يكون أكبر من صفر' },
      { status: 400 }
    )
  }

  // method must be valid
  const method = String(body.method ?? '')
  if (!VALID_METHODS.has(method)) {
    return NextResponse.json(
      { error: 'طريقة الدفع غير صالحة' },
      { status: 400 }
    )
  }

  // optional note
  const note =
    body.note !== undefined && body.note !== null
      ? String(body.note).trim() || null
      : null

  // 🛡️ Bug #11: optional saleId — link the payment to a specific sale
  const saleId = body.saleId ? parseInt(body.saleId, 10) : null
  let sale: any = null
  if (saleId) {
    if (isNaN(saleId)) {
      return NextResponse.json(
        { error: 'saleId غير صالح' },
        { status: 400 }
      )
    }
    sale = await db.sale.findUnique({
      where: { id: saleId },
      select: { id: true, tenantId: true, customerId: true, paid: true, total: true, invoiceNo: true, status: true },
    })
    if (!sale || sale.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: 'الفاتورة غير موجودة' },
        { status: 404 }
      )
    }
    if (sale.customerId && sale.customerId !== customerId) {
      return NextResponse.json(
        { error: 'الفاتورة لا تنتمي لهذا العميل' },
        { status: 400 }
      )
    }
    // 🛡️ 2026-09-30: مفيش دفعات على فاتورة مرتجعة بالكامل.
    if (sale.status === 'مرتجعة') {
      return NextResponse.json(
        { error: 'الفاتورة مرتجعة بالكامل — مش ممكن تستلم عليها دفعة' },
        { status: 400 }
      )
    }
    // 🛡️ 2026-09-30: الدفعة ماتعدّيش المتبقي على الفاتورة (قرار تجاري:
    // الزيادة ترفض — استخدم دفعة على الحساب من غير saleId).
    const remaining = sale.total - sale.paid
    if (amount > remaining + 0.005) {
      return NextResponse.json(
        { error: `الدفعة (${amount}) أكبر من المتبقي على الفاتورة (${Math.max(0, remaining)})` },
        { status: 400 }
      )
    }
  }

  const methodName = METHOD_LABELS[method] || method
  const customerName = customer.name

  let created
  try {
  created = await db.$transaction(async (tx) => {
    // 0. 🛡️ 2026-10-18: سقف الدفعة على الفاتورة بيتفحص *ذرياً* هنا — الفحص اللي فوق (remaining)
    //    بيتعمل بره الـ transaction، فدفعتين متزامنتين (ضغطتين/إرسال تاني) كانوا بيعدّوه الاتنين
    //    ويزوّدوا paid فوق إجمالي الفاتورة. حجز الدفعة يتم بـ UPDATE شرطي واحد.
    if (sale) {
      const claimed = await tx.sale.updateMany({
        where: {
          id: sale.id,
          tenantId: session.tenantId,
          status: { not: 'مرتجعة' },
          paid: { lte: sale.total - amount + 0.005 },
        },
        data: { paid: { increment: amount } },
      })
      if (claimed.count !== 1) throw new SaleOverpaid()
    }

    // 1. Create the Payment record
    const payment = await tx.payment.create({
      data: {
        tenantId: session.tenantId,
        customerId,
        amount,
        method,
        note,
      },
      include: { customer: true },
    })

    // 2. Decrement customer balance (allow going negative — overpayment => shop owes customer)
    const updatedCustomer = await tx.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: amount } },
    })

    // 3. Create the principal CashEntry with `method` column (Bug #22 fix)
    //    Use the unified helper.
    const principalEntry = await createPrincipalCashEntry(tx, {
      tenantId: session.tenantId,
      userId: session.userId,
      method,
      source: 'payment',
      refId: payment.id,
      amount, // positive — money INTO the drawer
      note: `دفعة من ${customerName} - ${methodName}${sale ? ` — فاتورة ${sale.invoiceNo ?? sale.id}` : ''}`,
    })

    // 4. 🛡️ 2026-09-30: NO commission on customer payments. A customer paying
    //    his account by wallet / InstaPay is a plain collection, not a
    //    wallet-agent service. Commission is only charged by the "financial
    //    transactions" module (finance/route.ts).

    // 5. 🛡️ Bug #11: If saleId was provided, link this payment to the sale
    //    via the SalePayment model + increment Sale.paid
    if (sale) {
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          note: `دفعة ${methodName} - ${customerName}`,
          cashEntryId: principalEntry.id,
        },
      })
      // (Sale.paid اتزوّد فوق في الحجز الذري)
    }

    // Attach the freshly-updated customer (post-decrement) to the response
    return {
      ...payment,
      customer: updatedCustomer,
      linkedSaleId: sale?.id ?? null,
      linkedCashEntryId: principalEntry.id,
    }
  })
  } catch (e) {
    if (e instanceof SaleOverpaid) {
      return NextResponse.json(
        { error: 'الدفعة أكبر من المتبقي على الفاتورة (أو الفاتورة اتغيّرت) — حدّث الصفحة وحاول تاني' },
        { status: 409 },
      )
    }
    throw e
  }

  // ⚡ EDGE CACHE purge (2026-10-06): السداد بيغير رصيد العميل والخزنة فوراً
  await purgeEdgeCache(
    [PURGE_KEYS.customersDefault, PURGE_KEYS.dashboard(7), PURGE_KEYS.dashboard(14), PURGE_KEYS.dashboard(30)],
    session.tenantId,
    2
  )
  return NextResponse.json(created, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
