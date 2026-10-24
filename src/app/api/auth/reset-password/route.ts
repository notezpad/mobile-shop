import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { loginKeys, clearLoginFailures } from '@/lib/login-guard'
import { extractRequestContext } from '@/lib/tracking/server'
import {
  isValidTokenShape, hashResetToken, confirmFailKey, isConfirmBlocked, recordAttempt,
} from '@/lib/password-reset'

export const dynamic = 'force-dynamic'

const INVALID = { error: 'الرابط غير صالح أو انتهت صلاحيته — اطلب رابط جديد' }

/** 🔑 تعيين كلمة مرور جديدة بالتوكن اللي وصل في الإيميل. */
async function __POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const token = body?.token
    const password = String(body?.password ?? '')
    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'كلمة المرور طويلة جداً' }, { status: 400 })
    }

    const ip = extractRequestContext(req.headers).clientIp
    const failKey = await confirmFailKey(ip)
    if (await isConfirmBlocked(failKey)) {
      return NextResponse.json(
        { error: 'محاولات كتيرة — حاول مرة أخرى بعد ساعة' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }
    if (!isValidTokenShape(token)) {
      await recordAttempt(failKey)
      return NextResponse.json(INVALID, { status: 400 })
    }

    const tokenHash = await hashResetToken(token)
    // استهلاك ذرّي: UPDATE ... RETURNING بيضمن إن التوكن يتستخدم مرة واحدة حتى لو جه طلبين مع بعض
    const consumed = await db.$queryRaw<{ id: number; userId: string }[]>`
      UPDATE "PasswordResetToken" SET "usedAt" = NOW()
      WHERE "tokenHash" = ${tokenHash} AND "usedAt" IS NULL AND "expiresAt" > NOW()
      RETURNING "id", "userId"`
    const row = consumed?.[0]
    if (!row) {
      await recordAttempt(failKey)
      return NextResponse.json(INVALID, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id: row.userId } })
    if (!user || !user.active || user.role === 'SUPER_ADMIN') {
      return NextResponse.json(INVALID, { status: 400 })
    }

    try {
      const hash = await hashPassword(password)
      await db.user.update({
        where: { id: user.id },
        data: { password: hash, passwordChangedAt: new Date() },
      })
    } catch (e) {
      // فشل الحفظ → رجّع التوكن صالح عشان المستخدم يقدر يعيد المحاولة
      await db.$executeRaw`UPDATE "PasswordResetToken" SET "usedAt" = NULL WHERE "id" = ${row.id}`
      throw e
    }

    // أي روابط تانية لنفس المستخدم تتبطّل + نصفّر عدّاد محاولات الدخول الفاشلة
    await db.$executeRaw`
      UPDATE "PasswordResetToken" SET "usedAt" = NOW()
      WHERE "userId" = ${user.id} AND "usedAt" IS NULL`
    try {
      const keys = await loginKeys(user.email.toLowerCase(), ip)
      await clearLoginFailures(keys.emailKey)
    } catch { /* ignore */ }

    await logAudit(
      { action: 'auth.password_reset', targetType: 'user', targetId: user.id, actor: { id: user.id, email: user.email } },
      req,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reset-password] Unexpected error:', e)
    return NextResponse.json({ error: 'خطأ داخلي في الخادم — حاول مرة أخرى' }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
