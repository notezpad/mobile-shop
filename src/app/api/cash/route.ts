import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const [entries, agg] = await Promise.all([
    db.cashEntry.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { id: 'desc' },
      take: 200,
    }),
    db.cashEntry.aggregate({
      where: { tenantId: session.tenantId },
      _sum: { amount: true },
    }),
  ])
  // `userId` on CashEntry is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const entriesWithNames = entries.map((e) => ({
    ...e,
    userName: e.userId ? (userNameById.get(e.userId) ?? null) : null,
  }))
  return NextResponse.json({
    balance: agg._sum.amount ?? 0,
    entries: entriesWithNames,
  })
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
  const amount = Number(body.amount)
  if (isNaN(amount) || amount === 0) {
    return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 })
  }
  const created = await db.cashEntry.create({
    data: {
      tenantId: session.tenantId,
      source: 'manual',
      amount,
      note: body.note ? String(body.note) : null,
      userId: session.userId,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
