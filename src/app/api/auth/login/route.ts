import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) {
    return NextResponse.json(
      { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return NextResponse.json(
      { error: 'بيانات الدخول غير صحيحة' },
      { status: 401 }
    )
  }
  if (!user.active) {
    return NextResponse.json(
      { error: 'تم تعطيل هذا الحساب — تواصل مع المدير' },
      { status: 403 }
    )
  }
  const ok = await verifyPassword(password, user.password)
  if (!ok) {
    return NextResponse.json(
      { error: 'بيانات الدخول غير صحيحة' },
      { status: 401 }
    )
  }

  // Update last login timestamp on the tenant (unless super admin)
  if (user.role !== 'SUPER_ADMIN') {
    try {
      await db.tenant.update({
        where: { id: user.tenantId },
        data: { lastLoginAt: new Date() },
      })
    } catch {
      /* ignore */
    }
  }

  await createSession({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
    email: user.email,
    branchId: (user as any).branchId ?? null,
  })

  return NextResponse.json({
    ok: true,
    user: {
      userId: user.id,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      email: user.email,
      branchId: (user as any).branchId ?? null,
    },
  })
}
