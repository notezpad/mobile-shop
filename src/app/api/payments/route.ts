import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const VALID_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'فودافون كاش',
  instapay: 'انستاباي',
  fawry: 'فوري',
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
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

  const payments = await db.payment.findMany({
    where: { tenantId: session.tenantId, customerId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(payments)
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
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

  // load tenant commission rates for non-cash methods
  let commission = 0
  if (method !== 'cash') {
    const tenant = await db.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        commissionVodafoneCash: true,
        commissionInstapay: true,
        commissionFawry: true,
      },
    })
    const rate =
      method === 'vodafone_cash'
        ? (tenant?.commissionVodafoneCash ?? 0)
        : method === 'instapay'
          ? (tenant?.commissionInstapay ?? 0)
          : (tenant?.commissionFawry ?? 0)
    commission = (amount * rate) / 100
  }

  const methodName = METHOD_LABELS[method] || method
  const customerName = customer.name

  const created = await db.$transaction(async (tx) => {
    // 1. create the Payment record
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

    // 2. decrement customer balance (allow going negative — overpayment => shop owes customer)
    const updatedCustomer = await tx.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: amount } },
    })

    // 3. CashEntry(ies)
    // First entry: the actual payment (+amount)
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'payment',
        refId: payment.id,
        amount,
        note: `دفعة من ${customerName} - ${methodName}`,
      },
    })

    // For non-cash methods: a second commission entry (-commission)
    if (method !== 'cash' && commission > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'commission',
          refId: payment.id,
          amount: -commission,
          note: `عمولة ${methodName} على دفعة ${customerName}`,
        },
      })
    }

    // Attach the freshly-updated customer (post-decrement) to the response
    return { ...payment, customer: updatedCustomer }
  })

  return NextResponse.json(created, { status: 201 })
}
