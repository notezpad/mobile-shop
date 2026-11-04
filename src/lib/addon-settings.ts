/**
 * 🧩 2026-11-04 (التحديث 25): أسعار الإضافات الفعلية — SERVER-ONLY.
 *
 * نفس نمط subscription-settings.ts: الإعدادات بترجع من جدول PlatformSetting،
 * ولو المفتاح مش موجود (أو القيمة غلط) بيرجع الافتراضي من addons.ts.
 *
 * مفاتيح الأسعار (الأدمن يضيفها/يعدلها بـ SQL من غير deploy):
 *   addonHrPriceMonthly    / addonHrPriceYearly     (افتراضي 149 / 1490)
 *   addonBranchPriceMonthly / addonBranchPriceYearly (افتراضي 99 / 990)
 *   addonUserPriceMonthly  / addonUserPriceYearly   (افتراضي 49 / 490)
 *
 * مثال:
 *   UPDATE "PlatformSetting" SET "value"='199' WHERE "key"='addonHrPriceMonthly';
 *   INSERT INTO "PlatformSetting" ("key","value") VALUES ('addonHrPriceMonthly','199');
 */

import { ADDON_CATALOG, type AddOnKey } from './addons'
import type { Sql } from './sql'

export type AddOnPrices = Record<AddOnKey, { monthly: number; yearly: number }>

function parsePrice(raw: unknown, fallback: number): number {
  const n = Number.parseFloat(String(raw ?? '').trim())
  if (!Number.isFinite(n) || n < 0) return fallback
  // قرش واحد أدنى حد — سعر صفر يعني الإضافة معطّلة للبيع (نعرضها غير متاحة)
  return Math.round(n * 100) / 100
}

/**
 * يقرأ أسعار الإضافات (مع تجاوزات PlatformSetting) بسطر SQL واحد.
 * لو فشل الاتصال/الجدول — بيرجّع الافتراضيات عشان صفحة الأسعار والدفع ماتوقعش.
 */
export async function readAddOnPrices(sql: Sql): Promise<AddOnPrices> {
  const keys = (Object.keys(ADDON_CATALOG) as AddOnKey[]).flatMap((k) => [
    ADDON_CATALOG[k].priceKeyMonthly,
    ADDON_CATALOG[k].priceKeyYearly,
  ])
  const fallback: AddOnPrices = {
    hr: { monthly: ADDON_CATALOG.hr.defaultPriceMonthly, yearly: ADDON_CATALOG.hr.defaultPriceYearly },
    extra_branch: { monthly: ADDON_CATALOG.extra_branch.defaultPriceMonthly, yearly: ADDON_CATALOG.extra_branch.defaultPriceYearly },
    extra_users: { monthly: ADDON_CATALOG.extra_users.defaultPriceMonthly, yearly: ADDON_CATALOG.extra_users.defaultPriceYearly },
  }
  try {
    // postgres.js بيبسّط المصفوفة تلقائياً إلى IN ($1, $2, ...) — آمن (parameters)
    const rows = await sql<{ key: string; value: string }[]>`
      SELECT "key", "value" FROM "PlatformSetting"
      WHERE "key" IN (${keys})`
    const m = new Map(rows.map((r) => [r.key, r.value]))
    const out = fallback
    for (const k of Object.keys(ADDON_CATALOG) as AddOnKey[]) {
      out[k].monthly = parsePrice(m.get(ADDON_CATALOG[k].priceKeyMonthly), fallback[k].monthly)
      out[k].yearly = parsePrice(m.get(ADDON_CATALOG[k].priceKeyYearly), fallback[k].yearly)
    }
    return out
  } catch {
    return fallback
  }
}
