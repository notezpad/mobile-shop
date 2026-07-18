import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, authErrorResponse, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const users = await db.user.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      branchId: true,
      createdAt: true,
      lastLoginAt: true,
      branch: { select: { name: true } },
    },
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const role = body.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'
  const branchId = body.branchId ? parseInt(body.branchId, 10) : null

  if (!name) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
      { status: 400 }
    )
  }
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'هذا البريد الإلكتروني مسجّل بالفعل' },
      { status: 400 }
    )
  }

  const hash = await hashPassword(password)
  const created = await db.user.create({
    data: {
      tenantId: session.tenantId,
      name,
      email,
      password: hash,
      role,
      branchId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      branchId: true,
      createdAt: true,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
