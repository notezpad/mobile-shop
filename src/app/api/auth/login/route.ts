import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { verifyPassword, hashPassword, createSession } from '@/lib/auth'
import { extractRequestContext } from '@/lib/tracking/server'
import { loginKeys, isLoginBlocked, recordLoginFailure, clearLoginFailures } from '@/lib/login-guard'
import { logAudit } from '@/lib/audit'

// hash وهمي بنفس صيغة PBKDF2 — بنتحقق منه لما الإيميل مش موجود عشان زمن الرد
// يبقى متقارب (يمنع كشف وجود الإيميل بقياس الزمن).
const DUMMY_HASH = 'pbkdf2:' + '00'.repeat(16) + ':' + '00'.repeat(32)
const BAD_CREDENTIALS = { error: 'بيانات الدخول غير صحيحة' }

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

    const keys = await loginKeys(email, extractRequestContext(req.headers).clientIp)
    if (await isLoginBlocked(keys)) {
      return NextResponse.json(
        { error: 'محاولات دخول كتيرة — حاول مرة أخرى بعد 15 دقيقة' },
        { status: 429, headers: { 'Retry-After': '900' } }
      )
    }

    const user = await db.user.findUnique({ where: { email } })
    // دايمًا بنعمل verify (حتى لو المستخدم مش موجود) + نفس الرسالة لكل الفشل
    const ok = await verifyPassword(password, user?.password ?? DUMMY_HASH)
    if (!user || !ok) {
      await recordLoginFailure(keys)
      return NextResponse.json(BAD_CREDENTIALS, { status: 401 })
    }
    // رسالة "الحساب معطل" بعد التأكد من الباسورد بس — عشان ما تكشفش وجود الإيميل
    if (!user.active) {
      return NextResponse.json(
        { error: 'تم تعطيل هذا الحساب — تواصل مع المدير' },
        { status: 403 }
      )
    }
    await clearLoginFailures(keys.emailKey)
    if (user.role === 'SUPER_ADMIN') {
      await logAudit({ action: 'auth.admin_login', targetType: 'user', targetId: user.id, actor: { id: user.id, email: user.email } }, req)
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
      { error: 'خطأ داخلي في الخادم — حاول مرة أخرى' },
      { status: 500 }
    )
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
