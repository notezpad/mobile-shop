import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { withSql } from '@/lib/sql'
import { sendEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { runNonBlocking, extractRequestContext } from '@/lib/tracking/server'
import {
  RESET_TTL_MIN, newResetToken, hashResetToken,
  resetRequestKeys, isResetRequestBlocked, recordAttempt,
} from '@/lib/password-reset'

export const dynamic = 'force-dynamic'

/**
 * 🔑 طلب استعادة كلمة المرور.
 * - الرد دايمًا نفس الرد (ok) سواء الإيميل موجود أو لأ → ما بنكشفش مين مسجّل.
 * - الإرسال Non-blocking عشان زمن الرد ما يفرّقش بين إيميل موجود وغير موجود.
 * - SUPER_ADMIN مستثنى (حساب المنصة له مسار تاني).
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function __POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'صيغة البريد الإلكتروني غير صحيحة' }, { status: 400 })
    }

    const ip = extractRequestContext(req.headers).clientIp
    const keys = await resetRequestKeys(email, ip)
    if (await isResetRequestBlocked(keys)) {
      return NextResponse.json(
        { error: 'طلبات كتيرة — حاول مرة أخرى بعد ساعة' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }
    await recordAttempt(keys.emailKey, keys.ipKey)

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true, role: true, tenantId: true },
    })

    if (user && user.active && user.role !== 'SUPER_ADMIN') {
      const token = newResetToken()
      const tokenHash = await hashResetToken(token)
      // أي رابط قديم لسه شغّال يتبطّل — آخر رابط بس هو الصالح
      await db.$executeRaw`
        UPDATE "PasswordResetToken" SET "usedAt" = NOW()
        WHERE "userId" = ${user.id} AND "usedAt" IS NULL`
      await db.$executeRaw`
        INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt")
        VALUES (${user.id}, ${tokenHash}, NOW() + (${RESET_TTL_MIN} * INTERVAL '1 minute'))`
      // تنظيف انتهازي للتوكنات القديمة
      if (Math.random() < 0.02) {
        await db.$executeRaw`DELETE FROM "PasswordResetToken" WHERE "expiresAt" < NOW() - INTERVAL '2 day'`
      }

      const origin = process.env.NODE_ENV === 'production' ? SITE_URL : req.nextUrl.origin
      const link = `${origin}/reset-password?token=${token}`
      const text =
        `أهلاً ${user.name || ''}،\n\n` +
        `وصلنا طلب لاستعادة كلمة المرور لحسابك على نظام المحل.\n\n` +
        `اضغط على الزر تحت وعيّن كلمة مرور جديدة. الرابط صالح لمدة ${RESET_TTL_MIN} دقيقة ولمرة واحدة بس.\n\n` +
        `لو إنت ماطلبتش ده، تجاهل الرسالة وحسابك هيفضل آمن زي ما هو.`
      runNonBlocking(() => withSql((sql) => sendEmail(sql, {
        to: user.email,
        kind: 'password-reset',
        tenantId: user.tenantId,
        subject: 'استعادة كلمة المرور — نظام المحل',
        text,
        ctaUrl: link,
      })))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[forgot-password] Unexpected error:', e)
    return NextResponse.json({ error: 'خطأ داخلي في الخادم — حاول مرة أخرى' }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
