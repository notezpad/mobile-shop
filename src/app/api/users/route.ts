import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse, hashPassword } from '@/lib/auth'
import { requireModule, featureErrorResponse, assertWithinPlanLimit } from '@/lib/features'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

async function __GET() {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'users') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  // ⚡ v12 EDGE CACHE (Error 1102 / CPU limit): قائمة المستخدمين بتتغير نادرًا
  // — 30 ثانية كاش على الحافة = أغلب فتحات صفحة المستخدمين من غير ما نشغّل
  // Prisma أصلاً (أول تشغيل Prisma في isolate بارد بياكل الـ 10ms CPU كاملة
  // وبيوقع الموقع). أي إضافة/تعديل/إيقاف مستخدم بيمسح الكاش فورًا.
  const cachedUsers = await matchEdgeCache('/api/users', '', session.tenantId, '1')
  if (cachedUsers) return cachedUsers

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
      permissions: true,
      canViewProfits: true,
      branch: { select: { name: true } },
    },
  })
  const res = NextResponse.json(users)
  await putEdgeCache(res.clone(), '/api/users', '', session.tenantId, 30, '1')
  return res
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'users') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  // 🛡️ 2026-10-10 FIX: فحص حد المستخدمين (maxUsers) — قبل الإصلاح ده الحد
  // كان بيتحفظ في الباقة بس مكانش بيتفحص، فكان يقدر يعمل مستخدمين بلا حدود.
  try { await assertWithinPlanLimit(session, 'users') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
  // 🔑 RBAC: الصلاحيات الخاصة بالموظف (null = يشوف كل الباقة)
  const permissions = role === 'ADMIN' ? null :
    (Array.isArray(body.permissions) && body.permissions.length > 0
      ? JSON.stringify(body.permissions)
      : null)
  // 🔒 الأرباح: المدير دايمًا يشوفها — الموظف بيحدده صاحب المحل
  const canViewProfits = role === 'ADMIN' ? true : Boolean(body.canViewProfits)

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
      permissions,
      canViewProfits,
    },
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
  // ⚡ v12: مستخدم جديد → امسح كاش قائمة المستخدمين فورًا
  await purgeEdgeCache([PURGE_KEYS.users], session.tenantId, '1')
  return NextResponse.json(created, { status: 201 })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
