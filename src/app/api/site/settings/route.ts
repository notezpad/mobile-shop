import { NextResponse } from 'next/server'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * GET /api/site/settings — إعدادات المنصة العامة (للفوتر وصفحة التواصل).
 * - عام (بدون تسجيل دخول) فبيرجّع مفاتيح "العرض" بس، مفيش أي سر.
 * - بيرجّع القيم المحفوظة وغير الفارغة فقط؛ الواجهة بتدمجها فوق الافتراضيات الثابتة
 *   (lib/site.ts) — فلو الأدمن ما حفظش حاجة الموقع بيفضل زي ما هو.
 * - كاش في المتصفح 5 دقايق (+stale-while-revalidate) عشان زوار الصفحات ما يضغطوش الـ DB.
 */
const PUBLIC_KEYS = [
  'platformName',
  'supportEmail',
  'supportPhone',
  'websiteUrl',
  'logoUrl',
  'facebookUrl',
  'twitterUrl',
  'telegramUrl',
  'instagramUrl',
  'whatsappUrl',
] as const

const URL_KEYS = new Set(['websiteUrl', 'facebookUrl', 'twitterUrl', 'telegramUrl', 'instagramUrl', 'whatsappUrl'])

function isSafe(key: string, v: string): boolean {
  if (v.length > 300) return false
  if (URL_KEYS.has(key)) return /^https?:\/\//i.test(v)
  if (key === 'logoUrl') return /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v)
  return true
}

export async function GET() {
  const out: Record<string, string> = {}
  try {
    await withSql(async (sql) => {
      const rows = await sql<{ key: string; value: string }[]>`
        SELECT "key", "value" FROM "PlatformSetting" WHERE "key" IN ${sql([...PUBLIC_KEYS])}`
      for (const r of rows) {
        const v = (r.value ?? '').trim()
        // دفاع إضافي: حتى لو اتحفظت قيمة غير آمنة قديمًا، ما بنعرضهاش للزوار
        if (v && isSafe(r.key, v)) out[r.key] = v
      }
    })
  } catch (e) {
    console.error('[site/settings] failed (serving defaults):', e)
  }
  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
