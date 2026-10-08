import { withDb } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getTrackingConfig } from '@/lib/tracking/config'
import { toPublicConfig } from '@/lib/tracking/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tracking/config
 *
 * إعدادات التتبع العامة للمتصفح — 🔒 بدون أي Secrets (توكنات/أسرار).
 * الاستخدام الأساسي: حقن الإعدادات من Root Layout (Server Component)
 * — هذا المسار احتياطي للعملاء الديناميكيين وللاختبار.
 */
async function __GET() {
  const cfg = await getTrackingConfig()
  return NextResponse.json(toPublicConfig(cfg), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
