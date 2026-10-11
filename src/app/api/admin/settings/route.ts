import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireSuperAdmin,
  authErrorResponse,
  hashPassword,
  getSession,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

const DEFAULTS: Record<string, string> = {
  platformName: 'منصة إدارة المحلات',
  supportEmail: 'support@shops-platform.com',
  supportPhone: '08000000000',
  websiteUrl: 'https://shops-platform.com',
  logoUrl: '',
  facebookUrl: '',
  twitterUrl: '',
  instagramUrl: '',
  whatsappUrl: '',
  // بانر تثبيت التطبيق (PWA) — 'true' = ظاهر لغير المثبّتين، 'false' = مخفي
  pwaInstallBannerEnabled: 'true',
}

async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const rows = await db.platformSetting.findMany()
  const map: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return NextResponse.json(map)
}

async function __PUT(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  // Allow password change in the same endpoint
  if (body.changePassword) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })
    }
    const newPassword = String(body.newPassword ?? '')
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      )
    }
    const hash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: session.userId },
      data: { password: hash },
    })
    return NextResponse.json({ ok: true, changedPassword: true })
  }

  const allowedKeys = Object.keys(DEFAULTS)
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const value = String(body[key])
      await db.platformSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }
  }

  const rows = await db.platformSetting.findMany()
  const map: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return NextResponse.json({ ok: true, settings: map })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
