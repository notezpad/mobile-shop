import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const METHODS = new Set(['vodafone_cash', 'instapay', 'fawry'])
const KINDS = new Set(['deposit', 'withdraw'])

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const method = searchParams.get('method')

  const where: any = { tenantId: session.tenantId }
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) {
      const toDate = new Date(to)
      toDate.setDate(toDate.getDate() + 1)
      where.createdAt.lt = toDate
    }
  }
  if (method && METHODS.has(method)) {
    where.method = method
  }
  const rows = await db.transaction.findMany({
    where,
    orderBy: { id: 'desc' },
  })
  // `userId` on Transaction is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    userName: r.userId ? (userNameById.get(r.userId) ?? null) : null,
  }))
  return NextResponse.json(result)
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
  if (!body) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const method = String(body.method ?? '')
  const kind = String(body.kind ?? '')
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: 'وسيلة غير صالحة' }, { status: 400 })
  }
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
  }
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
  }

  // commission rates from Tenant
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
  const commission = (amount * rate) / 100

  const note = body.note ? String(body.note) : null
  const principalSign = kind === 'deposit' ? 1 : -1

  const tx = await db.$transaction(async (dbx) => {
    const created = await dbx.transaction.create({
      data: {
        tenantId: session.tenantId,
        method,
        kind,
        amount,
        commission,
        note,
        userId: session.userId,
      },
    })
    // principal cash entry (signed by kind)
    await dbx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'transaction',
        refId: created.id,
        amount: principalSign * amount,
        note: `${kind === 'deposit' ? 'إيداع' : 'سحب'} ${
          method === 'vodafone_cash'
            ? 'فودافون كاش'
            : method === 'instapay'
              ? 'انستاباي'
              : 'فوري'
        } - ${amount}`,
        userId: session.userId,
      },
    })
    // commission always positive (shop earns it)
    if (commission > 0) {
      await dbx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'transaction',
          refId: created.id,
          amount: commission,
          note: `عمولة ${
            method === 'vodafone_cash'
              ? 'فودافون كاش'
              : method === 'instapay'
                ? 'انستاباي'
                : 'فوري'
          } - ${amount}`,
          userId: session.userId,
        },
      })
    }
    return created
  })
  return NextResponse.json(tx, { status: 201 })
}
