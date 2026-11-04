import { NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { getSql } from '@/lib/sql'
import { ADDON_CATALOG, ADDON_ORDER } from '@/lib/addons'
import { readAddOnPrices } from '@/lib/addon-settings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/addons/public
 *
 * 🧩 2026-11-04 (التحديث 25): كتالوج الإضافات المدفوعة — عام (بدون تسجيل دخول)
 * عشان صفحة الأسعار وصفحة الدفع يعرضوا الأسعار الحقيقية (بعد تجاوزات PlatformSetting).
 * الأسعار أرقام عامة مش سرية — نفس ما هو معروض للزوار في صفحة الأسعار.
 */
async function __GET() {
  const sql = getSql()
  const prices = await readAddOnPrices(sql)

  const items = ADDON_ORDER.map((key) => {
    const def = ADDON_CATALOG[key]
    return {
      key: def.key,
      name: def.name,
      desc: def.desc,
      unitLabel: def.unitLabel,
      quantifiable: def.quantifiable,
      maxQuantity: def.maxQuantity,
      bullets: def.bullets,
      priceMonthly: prices[key].monthly,
      priceYearly: prices[key].yearly,
    }
  })

  return NextResponse.json({ ok: true, items })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
