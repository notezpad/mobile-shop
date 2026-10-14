import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse, hashPassword } from '@/lib/auth'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

async function __PUT(
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

  // 🛡️ حماية القفل (2026-10-01): المحل ما يفضلش من غير مدير نشط، والمستخدم
  // ما يوقف أو يخفّض صلاحية حسابه بنفسه. بتغطي مفتاح الإيقاف في صفحة المستخدمين.
  const deactivating = body.active !== undefined && !body.active && existing.active
  const demoting = body.role !== undefined && body.role !== 'ADMIN' && existing.role === 'ADMIN'
  if (deactivating || demoting) {
    if (existing.id === session.userId) {
      return NextResponse.json(
        {
          error: deactivating
            ? 'لا يمكنك تعطيل حسابك بنفسك'
            : 'لا يمكنك تخفيض صلاحية حسابك بنفسك',
        },
        { status: 400 }
      )
    }
    if (existing.role === 'ADMIN' && existing.active) {
      const activeAdmins = await db.user.count({
        where: { tenantId: session.tenantId, role: 'ADMIN', active: true },
      })
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: 'لا يمكن تعطيل أو تخفيض آخر مدير نشط في المحل' },
          { status: 400 }
        )
      }
    }
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
  // 🔑 RBAC: تحديث صلاحيات الموظف
  if (body.permissions !== undefined) {
    const newRole = data.role ?? existing.role
    if (newRole === 'ADMIN') {
      data.permissions = null // المدير لا يقيّد
      data.canViewProfits = true
    } else {
      data.permissions = Array.isArray(body.permissions) && body.permissions.length > 0
        ? JSON.stringify(body.permissions)
        : null
    }
  }
  // 🔒 تحديث رؤية الأرباح (للموظفين فقط — المدير دايمًا true)
  if (body.canViewProfits !== undefined) {
    const newRole = data.role ?? existing.role
    data.canViewProfits = newRole === 'ADMIN' ? true : Boolean(body.canViewProfits)
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
      permissions: true,
      canViewProfits: true,
    },
  })
  // ⚡ v12: تعديل/إيقاف مستخدم → امسح كاش قائمة المستخدمين فورًا
  await purgeEdgeCache([PURGE_KEYS.users], session.tenantId, '1')
  return NextResponse.json(updated)
}

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
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  }
  // 🛡️ ما نسمحش للمستخدم يعطّل حسابه بنفسه
  if (existing.id === session.userId) {
    return NextResponse.json(
      { error: 'لا يمكنك تعطيل حسابك بنفسك' },
      { status: 400 }
    )
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
  // ⚡ v12: حذف (إيقاف) مستخدم → امسح كاش قائمة المستخدمين فورًا
  await purgeEdgeCache([PURGE_KEYS.users], session.tenantId, '1')
  return NextResponse.json(updated)
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
