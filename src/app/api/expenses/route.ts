import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

const CATEGORIES = new Set([
  'إيجار',
  'كهرباء ومياه',
  'مرتبات',
  'نقل ومواصلات',
  'صيانة المحل',
  'إنترنت واتصالات',
  'ضيافة',
  'أخرى',
])

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'expenses') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const category = searchParams.get('category')

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
  if (category && CATEGORIES.has(category)) {
    where.category = category
  }

  const rows = await db.expense.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 500,
  })
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

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const byCategory = rows.reduce((acc: Record<string, number>, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount
    return acc
  }, {})

  return NextResponse.json({ expenses: result, total, byCategory })
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'expenses') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const category = String(body.category ?? '').trim()
  if (!category) {
    return NextResponse.json({ error: 'النوع مطلوب' }, { status: 400 })
  }
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'المبلغ يجب أن يكون أكبر من صفر' },
      { status: 400 }
    )
  }
  const note = body.note ? String(body.note).trim() || null : null

  const created = await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        tenantId: session.tenantId,
        branchId: session.branchId ?? null,
        category,
        amount,
        note,
        userId: session.userId,
      },
    })
    // money leaving the till
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId,
        source: 'expense',
        refId: expense.id,
        amount: -amount,
        note: `الدول العربيةوف ${category}${note ? ' - ' + note : ''}`,
        userId: session.userId,
      },
    })
    return expense
  })

  return NextResponse.json(created, { status: 201 })
}
