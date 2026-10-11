import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pwa/config — إعدادات PWA العامة (بدون أي بيانات حساسة).
 * بيقرأها بانر التثبيت وقت التشغيل (no-store) عشان تغيير الأدمن يوصل فوراً.
 * الافتراضي: البانر مفعّل (لو الإعداد لسه ما اتحفظش).
 */
async function __GET() {
  const row = await db.platformSetting.findUnique({
    where: { key: 'pwaInstallBannerEnabled' },
  })
  const enabled = row ? row.value !== 'false' : true
  return NextResponse.json(
    { installBannerEnabled: enabled },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
