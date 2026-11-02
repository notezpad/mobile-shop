/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — عمولات البائعين (Seller Commissions).
 *
 * الفكرة: الفاتورة ليها «بائع» (Sale.sellerId) منفصل تماماً عن الكشير
 * (Sale.userId) — والعمولة بتتحسب على السيرفر بس من سجلات المبيعات نفسها
 * (بدون أي جدول وسيط بيتكتب وقت البيع) + لقطة النسبة محفوظة على كل فاتورة.
 *
 * 🛡️ قواعد ثابتة:
 *  1. **لقطة النسبة**: نسبة العمولة بتتحفظ على الفاتورة لحظة إنشائها
 *     (Sale.commissionRate كـ % مثل 3 = 3%) — تغيير النسب بعدين مبيأثرش
 *     على الفواتير القديمة.
 *  2. **المرتجع بيخصم بالعكس**: مرتجع شهر نوفمبر لفاتورة أكتوبر بيخصم من
 *     عمولة نوفمبر (المحاسبة بتاعة شهر المرتجع) — وبنسبة الفاتورة الأصلية
 *     (اللقططة) مش النسبة الحالية. ده اللي بيسد أشهر ثغرات أنظمة العمولات.
 *  3. **التارجت بوابة شهرية**: لو البائع عنده تارجت (استثناء له أو العام)
 *     وما حققوش على الصافي — عمولة الشهر = 0 (مش بس فوق التارجت).
 *  4. **الحساب كله على السيرفر** — الواجهة بتعرض أرقام من الـ API بس.
 *  5. **قيد فريد (محل، بائع، شهر)** على CommissionPayout — مستحيل صرف
 *     نفس عمولة نفس البائع لنفس الشهر مرتين (حتى بتزامن).
 *  6. القيم كلها كنسبة مئوية (%): 3 = 3% — والتحويل للكسر بيحصل هنا بس.
 *
 * ملاحظة الاستيراد: الملف ده **سيرفر فقط** (بيستورد lib/sql) — ممنوع
 * يستدعى من component. الواجهة بتاخد أرقامها من مسارات /api/commissions/*.
 */

import type { Sql } from './sql'
import { localDateStrToUtcBounds } from './tenantTime'

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** هل النص شكل شهر صحيح YYYY-MM؟ */
export function isMonthStr(m: unknown): m is string {
  return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
}

/** آخر يوم في الشهر بصيغة YYYY-MM-DD. */
function lastDayOfMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** حدود الشهر UTC (بتوقيت المحل) — لفلاتر createdAt في المبيعات والمرتجعات. */
export function monthRangeUtc(month: string, timeZone: string): { gte: Date; lte: Date } {
  return {
    gte: localDateStrToUtcBounds(`${month}-01`, 'start', timeZone),
    lte: localDateStrToUtcBounds(lastDayOfMonthStr(month), 'end', timeZone),
  }
}

/** الشهر السابق/التالي (لتنقّل التقرير) — YYYY-MM. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/* ─────────────── التحقق من المدخلات ─────────────── */

export interface CommissionSettingsValue {
  enabled: boolean
  /** النسبة العامة % (1..100) — null = بدون نسبة عامة */
  rate: number | null
  /** التارجت الشهري العام — null أو 0 = بدون تارجت */
  target: number | null
}

/** نسبة صالحة: رقم من >0 إلى <=100 (مقصوص لخانتين عشريتين). */
function parseRate(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    return { ok: false, error: 'النسبة لازم تكون أكبر من 0 وحتى 100 (مثال: 3 يعني 3%) — سيب الخانة فاضية لوراثة النسبة العامة' }
  }
  return { ok: true, value: round2(n) }
}

/** تارجت صالح: رقم >= 0 (0 = بدون تارجت) — مقصوص لخانتين. */
function parseTarget(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'التارجت لازم يكون رقم صحيح (0 = بدون تارجت)' }
  }
  return { ok: true, value: round2(n) || null }
}

/**
 * تحقق إعدادات عمولات المحل (PUT /api/tenant) — الحقول اختيارية (undefined =
 * من غير تغيير)، والتشغيل بيتطلب نسبة عامة (البائع ممكن يتجاوزها بالنسبة الخاصة بيه).
 */
export function normalizeCommissionSettings(
  body: any,
): { ok: true; value: Partial<CommissionSettingsValue> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'بيانات غير صالحة' }
  const value: Partial<CommissionSettingsValue> = {}

  if (body.sellerCommissionsEnabled !== undefined) {
    value.enabled = Boolean(body.sellerCommissionsEnabled)
  }
  if (body.sellerCommissionRate !== undefined) {
    const r = parseRate(body.sellerCommissionRate)
    if (!r.ok) return r
    value.rate = r.value
  }
  if (body.sellerCommissionTarget !== undefined) {
    const t = parseTarget(body.sellerCommissionTarget)
    if (!t.ok) return t
    value.target = t.value
  }
  if (value.enabled === true && (value.rate == null || value.rate <= 0)) {
    return { ok: false, error: 'لازم تحدد النسبة العامة للعمولة قبل التفعيل' }
  }
  return { ok: true, value }
}

/**
 * تحقق حقول البائع في شاشة المستخدمين (POST/PUT /api/users) — جزئية:
 * undefined = من غير تغيير. rate null = وراثة النسبة العامة، target null = وراثة العام.
 */
export function normalizeSellerFields(
  body: any,
): { ok: true; value: { isSeller?: boolean; sellerCommissionRate?: number | null; sellerCommissionTarget?: number | null } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'بيانات غير صالحة' }
  const value: { isSeller?: boolean; sellerCommissionRate?: number | null; sellerCommissionTarget?: number | null } = {}
  if (body.isSeller !== undefined) value.isSeller = Boolean(body.isSeller)
  if (body.sellerCommissionRate !== undefined) {
    const r = parseRate(body.sellerCommissionRate)
    if (!r.ok) return r
    value.sellerCommissionRate = r.value
  }
  if (body.sellerCommissionTarget !== undefined) {
    const t = parseTarget(body.sellerCommissionTarget)
    if (!t.ok) return t
    value.sellerCommissionTarget = t.value
  }
  // بائع بنسبة استثناء 0 → نحولها وراثة (null) بدل نسبة معطّلة
  if (value.sellerCommissionRate === null && value.isSeller !== false) {
    value.sellerCommissionRate = null
  }
  return { ok: true, value }
}

/** النسبة الفعلية لبائع: استثناء البائع ← النسبة العامة ← null (بدون عمولة). */
export function resolveSellerRate(
  sellerRate: number | null | undefined,
  tenantRate: number | null | undefined,
): number | null {
  if (sellerRate != null && sellerRate > 0) return sellerRate
  if (tenantRate != null && tenantRate > 0) return tenantRate
  return null
}

/** التارجت الفعلي لبائع: استثناء البائع ← العام ← null (بدون تارجت). */
export function resolveSellerTarget(
  sellerTarget: number | null | undefined,
  tenantTarget: number | null | undefined,
): number | null {
  if (sellerTarget != null && sellerTarget > 0) return sellerTarget
  if (tenantTarget != null && tenantTarget > 0) return tenantTarget
  return null
}

/** بوابة التارجت: حقق التارجت؟ وكم العمولة بعد البوابة؟ */
export function applyTargetGate(
  grossCommission: number,
  netBase: number,
  target: number | null,
): { targetMet: boolean; commission: number } {
  if (target != null && target > 0 && netBase < target) {
    return { targetMet: false, commission: 0 }
  }
  return { targetMet: true, commission: round2(grossCommission) }
}

/* ─────────────── تجميع أرقام الشهر من سجلات المبيعات ─────────────── */

export interface SellerMonthNumbers {
  userId: string
  /** عدد فواتير الشهر المنسوبة للبائع */
  invoices: number
  salesTotal: number
  /** عدد مرتجعات الشهر (على فواتير البائع) — بتوقيت المرتجع نفسه */
  returnsCount: number
  returnsTotal: number
  /** الصافي = مبيعات − مرتجعات (أساس بوابة التارجت) */
  netBase: number
  /** العمولة الخام قبل بوابة التارجت (ممكن تكون سالبة لو المرتجعات أكبر) */
  grossCommission: number
}

/**
 * تجميع عمولات شهر كامل لكل البائعين في استعلامين اتنين بس (بيع + مرتجع).
 * المرتجع بينسب للبائع الأصلي عبر ربط SaleReturn بالفاتورة، وبيحسب بنسبة
 * الفاتورة الأصلية (اللقططة) — مش النسبة الحالية.
 */
export async function sellersMonthAggregates(
  sql: Sql,
  tenantId: string,
  month: string,
  timeZone: string,
): Promise<Map<string, SellerMonthNumbers>> {
  const { gte, lte } = monthRangeUtc(month, timeZone)
  // 🛡️ مت-4 (الاستبدال): صافي المرتجع = SaleReturn.total − exchangeTotal (نفس قاعدة
  // التقارير واللوحة). قطعة الاستبدال بتتباع بنفس نسبة الفاتورة الأصلية، فالخصم
  // بيكون على الفرق الصافي بس — مرتجع 100 باستبدال بـ120 يبقى +20 مش −100.
  // 🛡️ ج-3 (2026-11-02): استثناء مرتجعات «مسار حذف الفاتورة» من أساس العمولة.
  // الحذف بيرجّع فلوس العميل ويحوّل الفاتورة لـ status='مرتجعة' من غير ما ينشئ
  // صف SaleReturn — وخصم المرتجعات هنا بيقرأ من SaleReturn، فالفاتورة كانت
  // بتتفصل عمولتها كاملة. الشرط: نستبعد 'مرتجعة' فقط لو ماعندهاش صف SaleReturn.
  // المرتجع العادي (له صف SaleReturn) بيفضل محسوب زي ما هو — الفاتورة تُجمع
  // وصف المرتجع يطرح؛ لو استبعدنا الفاتورة نفسها هيتطرح المرتجع مرتين
  // وعمولة البائع تبقى سالبة غلط.
  const [salesRows, returnRows] = await Promise.all([
    sql<{ uid: string; invoices: number; sales: number; comm: number }[]>`
      SELECT "sellerId" AS uid,
             COUNT(*)::int AS invoices,
             COALESCE(SUM("total"), 0) AS sales,
             COALESCE(SUM("total" * COALESCE("commissionRate", 0) / 100.0), 0) AS comm
      FROM "Sale"
      WHERE "tenantId" = ${tenantId} AND "sellerId" IS NOT NULL
        AND "createdAt" >= ${gte} AND "createdAt" <= ${lte}
        AND ("status" <> 'مرتجعة' OR EXISTS (
              SELECT 1 FROM "SaleReturn" sr WHERE sr."saleId" = "Sale"."id"))
      GROUP BY "sellerId"`,
    sql<{ uid: string; rets: number; ret: number; retcomm: number }[]>`
      SELECT s."sellerId" AS uid,
             COUNT(*)::int AS rets,
             COALESCE(SUM(r."total" - r."exchangeTotal"), 0) AS ret,
             COALESCE(SUM((r."total" - r."exchangeTotal") * COALESCE(s."commissionRate", 0) / 100.0), 0) AS retcomm
      FROM "SaleReturn" r
      JOIN "Sale" s ON s."id" = r."saleId"
      WHERE r."tenantId" = ${tenantId} AND s."sellerId" IS NOT NULL
        AND r."createdAt" >= ${gte} AND r."createdAt" <= ${lte}
      GROUP BY s."sellerId"`,
  ])

  const map = new Map<string, SellerMonthNumbers>()
  const ensure = (uid: string): SellerMonthNumbers => {
    let v = map.get(uid)
    if (!v) {
      v = { userId: uid, invoices: 0, salesTotal: 0, returnsCount: 0, returnsTotal: 0, netBase: 0, grossCommission: 0 }
      map.set(uid, v)
    }
    return v
  }
  for (const r of salesRows) {
    const v = ensure(String(r.uid))
    v.invoices = Number(r.invoices) || 0
    v.salesTotal = round2(Number(r.sales) || 0)
    v.grossCommission = round2(Number(r.comm) || 0)
  }
  for (const r of returnRows) {
    const v = ensure(String(r.uid))
    v.returnsCount = Number(r.rets) || 0
    v.returnsTotal = round2(Number(r.ret) || 0)
    v.grossCommission = round2(v.grossCommission - (Number(r.retcomm) || 0))
  }
  for (const v of map.values()) {
    v.netBase = round2(v.salesTotal - v.returnsTotal)
  }
  return map
}

/** صف إعدادات البائع كما تُقرأ من جدول User. */
export interface SellerUserRow {
  id: string
  name: string
  isSeller: boolean
  sellerCommissionRate: number | null
  sellerCommissionTarget: number | null
  active: boolean
}

/** إعدادات المحل كما تُقرأ من جدول Tenant. */
export interface TenantCommissionConfig {
  sellerCommissionsEnabled: boolean
  sellerCommissionRate: number | null
  sellerCommissionTarget: number | null
}
