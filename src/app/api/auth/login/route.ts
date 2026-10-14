import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { verifyPassword, hashPassword, createSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __POST(req: NextRequest) {
  try {
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

    // 🛡️ 2026-09-27: lazily migrate legacy bcrypt hashes to PBKDF2 the
    // first time their owner logs in successfully. `bcrypt.compare()` is
    // deliberately CPU-expensive (that's the whole point of bcrypt), but
    // Cloudflare Workers give each request a small CPU-time budget — see
    // the "Worker exceeded resource limits" (Error 1102) issue. Every
    // login by an account still on its original bcrypt hash was paying
    // that full CPU cost on EVERY single login, forever, instead of once.
    // We already have plain access to the correct password right here, so
    // just re-hash it with the cheap PBKDF2 (Web Crypto) scheme and save
    // it — from the next login onward this account no longer touches
    // bcrypt at all. Best-effort: never block/fail the login over this.
    if (user.password.startsWith('$2')) {
      try {
        const upgraded = await hashPassword(password)
        await db.user.update({ where: { id: user.id }, data: { password: upgraded } })
      } catch {
        /* ignore — will simply retry the migration on their next login */
      }
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

    // Update last login timestamp on the user themselves
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
    } catch {
      /* ignore */
    }

    // 🔑 RBAC: تحميل الصلاحيات من الداتابيز وتخزينها في الـ JWT
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { permissions: true, canViewProfits: true },
    })
    const permissions = (() => {
      try { const v = JSON.parse(fullUser?.permissions ?? 'null'); return Array.isArray(v) ? v : null } catch { return null }
    })()
    const canViewProfits = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
      ? true
      : Boolean(fullUser?.canViewProfits)

    await createSession({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
      email: user.email,
      branchId: (user as any).branchId ?? null,
      permissions,
      canViewProfits,
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
        permissions,
        canViewProfits,
      },
    })
  } catch (e: any) {
    console.error('[login] Unexpected error:', e)
    return NextResponse.json(
      { error: e?.message || 'خطأ داخلي في الخادم' },
      { status: 500 }
    )
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
