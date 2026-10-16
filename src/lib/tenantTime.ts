/**
 * tenantTime.ts — حساب حدود "اليوم" و"الشهر" بتوقيت المحل نفسه، مش بتوقيت
 * السيرفر ومش بتوقيت متصفح اللي فاتح الصفحة.
 *
 * ─────────────────────────────────────────────────────────────────
 * المشكلة اللي كانت موجودة (جذرية، مش في مكان واحد):
 * ─────────────────────────────────────────────────────────────────
 *   كل مكان كان بيحسب "بداية اليوم" بالشكل ده:
 *
 *     const d = new Date(); d.setHours(0, 0, 0, 0)
 *
 *   الكود ده بيحسب منتصف الليل بتوقيت الـ *سيرفر*. على Cloudflare
 *   Workers، توقيت السيرفر هو UTC دايماً. يعني فاتورة اتعملت الساعة
 *   1:53 صباحاً بتوقيت القاهرة (لسه النهاردة!) بتكون متسجلة في الداتابيز
 *   بتوقيت UTC اللي هو لسه "إمبارح" — فبيتم استبعادها من "مبيعات اليوم"
 *   في الداشبورد رغم إنها ظاهرة في سجل المبيعات بتاريخ النهاردة.
 *
 *   ومعتمدين على offset ثابت (+2) كان غلط أصلاً لأن مصر بترجع تطبق
 *   التوقيت الصيفي (DST) — يبقى الفرق عن UTC بيتغيّر خلال السنة.
 *
 *   كمان الاعتماد على توقيت *متصفح* الموظف (زي اللي كان متعمول في
 *   /api/sales عن طريق tzOffset) مش حل كامل: نفس المحل ممكن يتفتح من
 *   موظفين في بلدين مختلفين (أو حد مسافر)، فـ"اليوم" هيبقى مختلف حسب
 *   مين بيشغّل الصفحة — لازم "اليوم" يكون ثابت لكل المحل، مش لكل جهاز.
 *
 * ─────────────────────────────────────────────────────────────────
 * الحل:
 * ─────────────────────────────────────────────────────────────────
 *   كل Tenant دلوقتي عنده حقل `timezone` (IANA، زي "Africa/Cairo").
 *   كل حساب لـ"اليوم" أو "الشهر" في السيرفر بيمر من هنا، وبيستخدم
 *   Intl.DateTimeFormat (مبني في الـ runtime، مفيش حاجة تتنصب) عشان
 *   يحوّل بتوقيت المنطقة الصحيح — وده بيتعامل صح مع التوقيت الصيفي
 *   تلقائياً، من غير ما نفترض offset ثابت.
 */

import { getSql } from './sql'

export const DEFAULT_TENANT_TIMEZONE = 'Africa/Cairo'

// ─────────────────────────────────────────────
// جلب توقيت المحل (مع fallback آمن لو مش موجود)
// ⚡ 2026-10-17: كاش per-isolate 5 دقايق + استعلام SQL خفيف (postgres.js)
// بدل Prisma — كانت بتدفع استعلام Tenant كامل في كل طلب فيه فلتر تاريخ.
// ─────────────────────────────────────────────
const TZ_CACHE_TTL_MS = 5 * 60_000
const tzCache = new Map<string, { at: number; tz: string }>()

export async function getTenantTimezone(tenantId: string): Promise<string> {
  const hit = tzCache.get(tenantId)
  if (hit && Date.now() - hit.at < TZ_CACHE_TTL_MS) return hit.tz
  try {
    const rows = await getSql()`SELECT "timezone" FROM "Tenant" WHERE "id" = ${tenantId} LIMIT 1`
    const tz = rows[0]?.timezone || DEFAULT_TENANT_TIMEZONE
    if (tzCache.size > 500) tzCache.clear()
    tzCache.set(tenantId, { at: Date.now(), tz })
    return tz
  } catch {
    // لو حصل أي خطأ (مثلاً tenantId بتاع الأدمن نفسه)، منسيبش الـ API يقع
    // بسبب حساب التوقيت — نرجع الافتراضي.
    return DEFAULT_TENANT_TIMEZONE
  }
}

// ─────────────────────────────────────────────
// أدوات تحويل عامة: توقيت منطقة ↔ UTC
// ─────────────────────────────────────────────

/** فرق التوقيت (بالميلي ثانية) بين UTC والمنطقة المحددة، وقت `date` بالذات
 *  (بيتغيّر حسب التوقيت الصيفي فمينفعش نحسبه مرة واحدة ونثبّته). */
function tzOffsetMsAt(date: Date, timeZone: string): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const zoned = new Date(date.toLocaleString('en-US', { timeZone }))
  return utc.getTime() - zoned.getTime()
}

/** بيحوّل "توقيت حائط" محلي (سنة-شهر-يوم ساعة:دقيقة:ثانية بتوقيت `timeZone`)
 *  إلى الـ UTC Date المطابق له فعلياً — ده اللي بيتقارن مع createdAt في DB. */
function zonedWallTimeToUtc(isoLocalNoZone: string, timeZone: string): Date {
  const naiveUtc = new Date(`${isoLocalNoZone}Z`)
  const offset = tzOffsetMsAt(naiveUtc, timeZone)
  return new Date(naiveUtc.getTime() + offset)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" بتوقيت المنطقة المحددة (بديل getLocalDateStr، لكن بتوقيت
 *  المحل مش بتوقيت المتصفح). */
export function dateStrInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

// ─────────────────────────────────────────────
// حدود اليوم / الشهر — دول اللي تستخدمهم في أي مكان
// كان فيه startOfDay/startOfMonth بتوقيت السيرفر
// ─────────────────────────────────────────────

/** بداية اليوم (00:00:00.000 بتوقيت المحل) كـ UTC Date، جاهزة تتقارن
 *  مباشرة مع createdAt. */
export function startOfDayInTz(refDate: Date, timeZone: string): Date {
  return zonedWallTimeToUtc(`${dateStrInTz(refDate, timeZone)}T00:00:00.000`, timeZone)
}

/** نهاية اليوم (23:59:59.999 بتوقيت المحل) كـ UTC Date. */
export function endOfDayInTz(refDate: Date, timeZone: string): Date {
  return zonedWallTimeToUtc(`${dateStrInTz(refDate, timeZone)}T23:59:59.999`, timeZone)
}

/** بداية الشهر الحالي (أول يوم، 00:00:00.000 بتوقيت المحل) كـ UTC Date. */
export function startOfMonthInTz(refDate: Date, timeZone: string): Date {
  const [y, m] = dateStrInTz(refDate, timeZone).split('-')
  return zonedWallTimeToUtc(`${y}-${m}-01T00:00:00.000`, timeZone)
}

/** بداية السنة الحالية (1 يناير، 00:00:00.000 بتوقيت المحل) كـ UTC Date. */
export function startOfYearInTz(refDate: Date, timeZone: string): Date {
  const [y] = dateStrInTz(refDate, timeZone).split('-')
  return zonedWallTimeToUtc(`${y}-01-01T00:00:00.000`, timeZone)
}

/** بيحوّل تاريخ "YYYY-MM-DD" (زي اللي جاي من date input) لبداية/نهاية
 *  اليوم ده بتوقيت المحل، كـ UTC Date — للاستخدام في فلاتر from/to. */
export function localDateStrToUtcBounds(
  dateStr: string,
  edge: 'start' | 'end',
  timeZone: string,
): Date {
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999'
  return zonedWallTimeToUtc(`${dateStr}T${time}`, timeZone)
}
