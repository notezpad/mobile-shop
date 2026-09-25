import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { recordCommission, createPrincipalCashEntry } from '@/lib/commission'

export const dynamic = 'force-dynamic'

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
  try { await requireModule(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { searchParams } = new URL(req.url)
  const supplierIdRaw = searchParams.get('supplierId')
  const supplierId = supplierIdRaw ? parseInt(supplierIdRaw, 10) : NaN
  if (isNaN(supplierId)) {
    return NextResponse.json({ error: 'معرف المورد مطلوب' }, { status: 400 })
  }
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, tenantId: true },
  })
  if (!supplier || supplier.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
  }

  const payments = await db.supplierPayment.findMany({
    where: { tenantId: session.tenantId, supplierId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(payments)
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'suppliers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  // supplierId required & must belong to tenant
  const supplierId = parseInt(body.supplierId, 10)
  if (isNaN(supplierId)) {
    return NextResponse.json({ error: 'معرف المورد مطلوب' }, { status: 400 })
  }
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier || supplier.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'المورد غير موجود في هذا المحل' },
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
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }

  const note =
    body.note !== undefined && body.note !== null
      ? String(body.note).trim() || null
      : null

  const methodName = METHOD_LABELS[method] || method
  const supplierName = supplier.name

  const created = await db.$transaction(async (tx) => {
    // 1. create the SupplierPayment record (we pay the supplier)
    const payment = await tx.supplierPayment.create({
      data: {
        tenantId: session.tenantId,
        supplierId,
        amount,
        method,
        note,
      },
      include: { supplier: true },
    })

    // 2. decrement supplier balance (allow going negative — we overpaid, supplier owes us)
    const updatedSupplier = await tx.supplier.update({
      where: { id: supplierId },
      data: { balance: { decrement: amount } },
    })

    // 3. 🛡️ 2026-09-15 (v3): CashEntry with `method` column (Bug #22)
    //    money leaving the drawer, so amount is NEGATIVE
    const principalEntry = await createPrincipalCashEntry(tx, {
      tenantId: session.tenantId,
      userId: session.userId,
      method,
      source: 'supplier_payment',
      refId: payment.id,
      amount: -amount,
      note: `دفعة لمورد ${supplierName} - ${methodName}`,
    })

    // 4. 🛡️ 2026-09-15 (v3): Record commission (Bug #9 fix — was missing
    //    entirely from this route, but customer payments had it. Now both
    //    use the unified helper. The shop EARNS the commission even when
    //    paying a supplier via Vodafone Cash — it's a service fee from
    //    Vodafone to the shop.)
    const { commission, commissionEntryId } = await recordCommission(tx, {
      tenantId: session.tenantId,
      userId: session.userId,
      method,
      amount,
      refType: 'supplier_payment',
      refId: payment.id,
      noteSuffix: supplierName,
    })

    return {
      ...payment,
      supplier: updatedSupplier,
      commission,
      commissionEntryId,
      linkedCashEntryId: principalEntry.id,
    }
  })

  return NextResponse.json(created, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
