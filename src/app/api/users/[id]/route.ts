import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, authErrorResponse, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
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
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }

  const data: any = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    data.name = name
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: 'بريد إلكتروني غير صالح' },
        { status: 400 }
      )
    }
    const dup = await db.user.findUnique({ where: { email } })
    if (dup && dup.id !== id) {
      return NextResponse.json(
        { error: 'هذا البريد الإلكتروني مسجّل بالفعل' },
        { status: 400 }
      )
    }
    data.email = email
  }
  if (body.role !== undefined) {
    data.role = body.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'
  }
  if (body.branchId !== undefined) {
    data.branchId = body.branchId ? parseInt(body.branchId, 10) : null
  }
  if (body.active !== undefined) {
    data.active = Boolean(body.active)
  }
  if (body.password !== undefined) {
    const pw = String(body.password)
    if (pw.length < 6) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      )
    }
    data.password = await hashPassword(pw)
  }

  const updated = await db.user.update({
    where: { id },
    data,
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
  return NextResponse.json(updated)
}

export async function DELETE(
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
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }
  // Don't deactivate the last active admin in a tenant
  if (existing.role === 'ADMIN') {
    const activeAdmins = await db.user.count({
      where: { tenantId: session.tenantId, role: 'ADMIN', active: true },
    })
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: 'لا يمكن تعطيل آخر مدير في المحل' },
        { status: 400 }
      )
    }
  }
  // Soft delete (deactivate) — preserve history
  const updated = await db.user.update({
    where: { id },
    data: { active: false },
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
  return NextResponse.json(updated)
}
