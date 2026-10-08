/**
 * ═══════════════════════════════════════════════════════════════════
 * Tracking Analytics — Funnel + Attribution
 * ═══════════════════════════════════════════════════════════════════
 * يعتمد بالكامل على البيانات الموجودة:
 *   - TrackingEvent   (أحداث المراحل + PageView الداخلي provider='internal')
 *   - UserAttribution (first/last touch + click ids)
 *   - User / Tenant / Subscription (لربط مستخدم الإسناد بالاشتراك)
 *
 * قواعد العدّ:
 *   - كل مرحلة تُحسب بـ COUNT(DISTINCT eventId) — لأن نفس الحدث يُسجل
 *     لكل مزود (meta/tiktok/ga4) بنفس المعرّف → العدّ الحقيقي بلا تكرار.
 *   - الأحداث تُحسب بغض النظر عن status (sent/failed) — فشل الإرسال
 *     لمنصة ما لا يعني أن العملية التجارية لم تحدث.
 *   - الزوار = جلسات PageView الداخلية (صف لكل جلسة).
 *   - فلاتر Source/Medium/Campaign تربط الأحداث بالمستخدم عبر:
 *       Registrations: eventId 'signup-<userId>'
 *       البقية:        subscriptionId → Tenant.ownerEmail → User
 *   - لا تُغيّر أي شيء في نظام التتبع الحالي — قراءة فقط.
 */

import { Prisma } from '@prisma/client'

export const INTERNAL_PROVIDER = 'internal'

export interface FunnelFilters {
  from: string // ISO datetime
  to: string // ISO datetime (exclusive)
  platform?: string | null // all | meta | tiktok | ga4 | google_ads
  source?: string | null
  medium?: string | null
  campaign?: string | null
  model?: 'first' | 'last'
}

export interface FunnelResult {
  visitors: number
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  steps: { key: string; label: string; count: number; fromPrev: number | null }[]
  overallFromVisitors: number | null
  overallFromRegistrations: number | null
  /** true إذا حُسب عبر المسار الاحتياطي ORM (فشل SQL الخام) */
  fallback?: boolean
}

export interface AttributionFilters extends FunnelFilters {
  sortBy?: 'purchases' | 'revenue' | 'trials' | 'conversion' | 'registrations'
  order?: 'asc' | 'desc'
  limit?: number
}

export interface AttributionRow {
  source: string
  medium: string
  campaign: string
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  trialToPaid: number | null // %
  revenue: number
}

type DbLike = { $queryRaw: (q: TemplateStringsArray | Prisma.Sql, ...p: unknown[]) => Promise<any[]> }

// ─── مساعدات بناء الشروط ─────────────────────────────────────────────

function touchCol(f: FunnelFilters, field: 'Source' | 'Medium' | 'Campaign'): string {
  return f.model === 'last' ? `lastTouch${field}` : `firstTouch${field}`
}

/** شروط مطابقة الإسناد (source/medium/campaign) على جدول UserAttribution بمعرّف alias */
function attrConditions(f: FunnelFilters, alias: string): Prisma.Sql[] {
  const parts: Prisma.Sql[] = []
  if (f.source) parts.push(Prisma.sql`LOWER(COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${touchCol(f, 'Source')}"`)})) = LOWER(${f.source})`)
  if (f.medium) parts.push(Prisma.sql`LOWER(COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${touchCol(f, 'Medium')}"`)})) = LOWER(${f.medium})`)
  if (f.campaign) parts.push(Prisma.sql`LOWER(COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${touchCol(f, 'Campaign')}"`)})) = LOWER(${f.campaign})`)
  return parts
}

const hasAttrFilter = (f: FunnelFilters): boolean => !!(f.source || f.medium || f.campaign)

/** شرط فلتر المنصة على عمود provider */
function platformCond(f: FunnelFilters, col: string): Prisma.Sql {
  if (!f.platform || f.platform === 'all') return Prisma.empty
  return Prisma.sql` AND ${Prisma.raw(col)} = ${f.platform}`
}

const DIRECT = '(مباشر)'
const NONE = '—'

// ─── 1) القمع التحليلي ───────────────────────────────────────────────

export async function getFunnel(db: DbLike, f: FunnelFilters): Promise<FunnelResult> {
  const useAttr = hasAttrFilter(f)

  const attrCte = useAttr
    ? Prisma.sql`attr AS (
        SELECT ua."userId" FROM "UserAttribution" ua WHERE ${Prisma.join(attrConditions(f, 'ua'), ' AND ')}
      ),`
    : Prisma.empty

  // Registrations — eventId بصيغة signup-<userId>
  const regsExpr = useAttr
    ? Prisma.sql`(SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
        WHERE e."eventName" = 'CompleteRegistration' ${platformCond(f, 'e."provider"')}
          AND regexp_replace(e."eventId", '^signup-', '') IN (SELECT "userId" FROM attr))`
    : Prisma.sql`(SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
        WHERE e."eventName" = 'CompleteRegistration' ${platformCond(f, 'e."provider"')})`

  // مراحل الاشتراك — عبر subscriptionId → tenant → المستخدم المالك → الإسناد
  const subStageExpr = (eventName: string): Prisma.Sql =>
    useAttr
      ? Prisma.sql`(SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
          JOIN "Subscription" s ON s."id" = e."subscriptionId"
          JOIN "Tenant" tn ON tn."id" = s."tenantId"
          JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
          WHERE e."eventName" = ${eventName} ${platformCond(f, 'e."provider"')}
            AND u."id" IN (SELECT "userId" FROM attr))`
      : Prisma.sql`(SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
          WHERE e."eventName" = ${eventName} ${platformCond(f, 'e."provider"')})`

  const rows: Array<Record<string, number>> = await db.$queryRaw`
    WITH ${attrCte}
    ev AS (
      SELECT DISTINCT t."eventId", t."eventName", t."provider", t."subscriptionId"
      FROM "TrackingEvent" t
      WHERE t."createdAt" >= ${f.from}::timestamptz
        AND t."createdAt" < ${f.to}::timestamptz
        AND t."eventName" IN ('PageView', 'CompleteRegistration', 'StartTrial', 'InitiateCheckout', 'Purchase')
    )
    SELECT
      (SELECT COUNT(*)::int FROM ev WHERE "eventName" = 'PageView') AS visitors,
      ${regsExpr} AS registrations,
      ${subStageExpr('StartTrial')} AS trials,
      ${subStageExpr('InitiateCheckout')} AS checkouts,
      ${subStageExpr('Purchase')} AS purchases
  `

  const r = rows[0] ?? {}
  const visitors = Number(r.visitors ?? 0)
  const registrations = Number(r.registrations ?? 0)
  const trials = Number(r.trials ?? 0)
  const checkouts = Number(r.checkouts ?? 0)
  const purchases = Number(r.purchases ?? 0)

  const defs: [string, string, number][] = [
    ['visitors', 'الزوار', visitors],
    ['registrations', 'التسجيلات', registrations],
    ['trials', 'التجارب', trials],
    ['checkouts', 'بدء الدفع', checkouts],
    ['purchases', 'المدفوعات', purchases],
  ]
  let prev: number | null = null
  const steps = defs.map(([key, label, count]) => {
    const fromPrev = prev === null || prev === 0 ? null : count / prev
    prev = count
    return { key, label, count, fromPrev }
  })

  return {
    visitors, registrations, trials, checkouts, purchases,
    steps,
    overallFromVisitors: visitors > 0 ? purchases / visitors : null,
    overallFromRegistrations: registrations > 0 ? purchases / registrations : null,
  }
}

// ─── 1-ب) قمع احتياطي عبر Prisma ORM (بدون SQL خام) ──────────────────
/**
 * نسخة احتياطية آمنة من القمع تعمل عبر استعلامات ORM فقط — تُستخدم
 * إذا فشل مسار SQL الخام في بيئة التشغيل (wasm/Hyperdrive مثلاً).
 * تحسب نفس الأرقام الحقيقية (distinct eventId لكل مرحلة) — لكن فقط
 * بدون فلاتر source/medium/campaign (هذه تحتاج JOIN غير متاح في ORM).
 * مطابقة لسلوك المسار الخام: فلتر المنصة يُطبق على مراحل الأحداث فقط
 * (الزوار داخليون دائماً provider='internal').
 */
export async function getFunnelFallback(db: any, f: FunnelFilters): Promise<FunnelResult> {
  const timeWhere: Record<string, unknown> = {
    createdAt: { gte: new Date(f.from), lt: new Date(f.to) },
  }
  const hasPlatform = !!(f.platform && f.platform !== 'all')
  const platformWhere = hasPlatform ? { provider: f.platform } : {}

  const distinctIds = async (where: Record<string, unknown>): Promise<Set<string>> => {
    const rows: Array<{ eventId: string }> = await db.trackingEvent.findMany({
      where,
      select: { eventId: true },
      distinct: ['eventId'],
      take: 50000,
    })
    return new Set(rows.map((r) => r.eventId))
  }

  // الزوار: بدون فلتر منصة (مطابق للمسار الخام — PageView داخلي)
  const stage = async (name: string, applyPlatform: boolean): Promise<number> =>
    (await distinctIds({ ...timeWhere, ...(applyPlatform ? platformWhere : {}), eventName: name })).size

  const [visitors, registrations, trials, checkouts, purchases] = await Promise.all([
    stage('PageView', false),
    stage('CompleteRegistration', hasPlatform),
    stage('StartTrial', hasPlatform),
    stage('InitiateCheckout', hasPlatform),
    stage('Purchase', hasPlatform),
  ])

  const defs: [string, string, number][] = [
    ['visitors', 'الزوار', visitors],
    ['registrations', 'التسجيلات', registrations],
    ['trials', 'التجارب', trials],
    ['checkouts', 'بدء الدفع', checkouts],
    ['purchases', 'المدفوعات', purchases],
  ]
  let prev: number | null = null
  const steps = defs.map(([key, label, count]) => {
    const fromPrev = prev === null || prev === 0 ? null : count / prev
    prev = count
    return { key, label, count, fromPrev }
  })
  return {
    visitors, registrations, trials, checkouts, purchases,
    steps,
    overallFromVisitors: visitors > 0 ? purchases / visitors : null,
    overallFromRegistrations: registrations > 0 ? purchases / registrations : null,
    fallback: true,
  }
}

// ─── 2) تقارير الإسناد ───────────────────────────────────────────────

/**
 * صف لكل مجموعة (Source × Medium × Campaign).
 * - Registrations: تسجيلات الفترة (CompleteRegistration) مصنفة بالإسناد
 *   (بدون بيانات إسناد → "مباشر").
 * - Trials/Checkouts/Purchases: أحداث الفترة مرتبطة بمستخدم مالك
 *   الاشتراك ثم بمجموعة إسناده (بغض النظر عن تاريخ تسجيله).
 */
export async function getAttribution(db: DbLike, f: AttributionFilters): Promise<AttributionRow[]> {
  const useAttr = hasAttrFilter(f)

  const attrCte = Prisma.sql`ua AS (SELECT * FROM "UserAttribution")`

  // ربط بجدول الإسناد: مع فلاتر → INNER مع شروط، بدون → LEFT محافظ
  const uaJoin = (userCol: string): Prisma.Sql =>
    useAttr
      ? Prisma.sql`JOIN ua ON ua."userId" = ${Prisma.raw(userCol)} AND ${Prisma.join(attrConditions(f, 'ua'), ' AND ')}`
      : Prisma.sql`LEFT JOIN ua ON ua."userId" = ${Prisma.raw(userCol)}`

  // أعمدة التصنيف تتبع نموذج الإسناد (first/last touch)
  const srcColName = touchCol(f, 'Source')
  const medColName = touchCol(f, 'Medium')
  const campColName = touchCol(f, 'Campaign')
  const groupCols = (alias: string): Prisma.Sql =>
    Prisma.sql`COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${srcColName}"`)}, ${DIRECT}) AS src,
               COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${medColName}"`)}, ${NONE}) AS med,
               COALESCE(${Prisma.raw(alias)}.${Prisma.raw(`"${campColName}"`)}, ${NONE}) AS camp`

  // ملاحظة: التصنيف والفلاتر كلاهما يتبع نموذج الإسناد المختار (first/last)
  const p = platformCond(f, 'e."provider"')

  const sql = Prisma.sql`
    WITH ${attrCte},
    ev AS (
      SELECT DISTINCT t."eventId", t."eventName", t."provider", t."subscriptionId"
      FROM "TrackingEvent" t
      WHERE t."createdAt" >= ${f.from}::timestamptz AND t."createdAt" < ${f.to}::timestamptz
    ),
    g_regs AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT re."userId")::int AS registrations
      FROM (
        SELECT DISTINCT regexp_replace(e."eventId", '^signup-', '') AS "userId"
        FROM ev e WHERE e."eventName" = 'CompleteRegistration' ${p}
      ) re
      ${uaJoin('re."userId"')}
      GROUP BY 1, 2, 3
    ),
    g_trials AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT e."eventId")::int AS trials
      FROM ev e
      JOIN "Subscription" s ON s."id" = e."subscriptionId"
      JOIN "Tenant" tn ON tn."id" = s."tenantId"
      JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
      ${uaJoin('u."id"')}
      WHERE e."eventName" = 'StartTrial' ${p}
      GROUP BY 1, 2, 3
    ),
    g_checkouts AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT e."eventId")::int AS checkouts
      FROM ev e
      JOIN "Subscription" s ON s."id" = e."subscriptionId"
      JOIN "Tenant" tn ON tn."id" = s."tenantId"
      JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
      ${uaJoin('u."id"')}
      WHERE e."eventName" = 'InitiateCheckout' ${p}
      GROUP BY 1, 2, 3
    ),
    g_purch AS (
      SELECT src, med, camp, COUNT(*)::int AS purchases, SUM(amount)::float AS revenue
      FROM (
        SELECT DISTINCT ON (e."eventId")
          e."eventId", s."amountPaid" AS amount,
          COALESCE(ua.${Prisma.raw(`"${srcColName}"`)}, ${DIRECT}) AS src,
          COALESCE(ua.${Prisma.raw(`"${medColName}"`)}, ${NONE}) AS med,
          COALESCE(ua.${Prisma.raw(`"${campColName}"`)}, ${NONE}) AS camp
        FROM ev e
        JOIN "Subscription" s ON s."id" = e."subscriptionId"
        JOIN "Tenant" tn ON tn."id" = s."tenantId"
        JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
        ${uaJoin('u."id"')}
        WHERE e."eventName" = 'Purchase' ${p}
      ) x
      GROUP BY src, med, camp
    )
    SELECT
      COALESCE(r.src, t.src, c.src, pu.src) AS source,
      COALESCE(r.med, t.med, c.med, pu.med) AS medium,
      COALESCE(r.camp, t.camp, c.camp, pu.camp) AS campaign,
      COALESCE(r.registrations, 0)::int AS registrations,
      COALESCE(t.trials, 0)::int AS trials,
      COALESCE(c.checkouts, 0)::int AS checkouts,
      COALESCE(pu.purchases, 0)::int AS purchases,
      COALESCE(pu.revenue, 0)::float AS revenue
    FROM g_regs r
    FULL OUTER JOIN g_trials t ON t.src = r.src AND t.med = r.med AND t.camp = r.camp
    FULL OUTER JOIN g_checkouts c ON c.src = COALESCE(r.src, t.src) AND c.med = COALESCE(r.med, t.med) AND c.camp = COALESCE(r.camp, t.camp)
    FULL OUTER JOIN g_purch pu ON pu.src = COALESCE(r.src, t.src, c.src) AND pu.med = COALESCE(r.med, t.med, c.med) AND pu.camp = COALESCE(r.camp, t.camp, c.camp)
  `

  // الترتيب — بعناصر ثابتة فقط (لا SQL injection)
  const sortMap: Record<string, Prisma.Sql> = {
    purchases: Prisma.sql`purchases`,
    revenue: Prisma.sql`revenue`,
    trials: Prisma.sql`trials`,
    registrations: Prisma.sql`registrations`,
    conversion: Prisma.sql`(COALESCE(pu.purchases, 0)::float / NULLIF(COALESCE(r.registrations, 0), 0))`,
  }
  const orderBy = sortMap[f.sortBy ?? 'registrations'] ?? sortMap.registrations
  const dir = f.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500)

  const rows: Array<Record<string, unknown>> = await db.$queryRaw`${sql} ORDER BY ${orderBy} ${dir} NULLS LAST LIMIT ${limit}`

  return rows.map((r) => {
    const trials = Number(r.trials ?? 0)
    const purchases = Number(r.purchases ?? 0)
    return {
      source: String(r.source ?? DIRECT),
      medium: String(r.medium ?? NONE),
      campaign: String(r.campaign ?? NONE),
      registrations: Number(r.registrations ?? 0),
      trials,
      checkouts: Number(r.checkouts ?? 0),
      purchases,
      trialToPaid: trials > 0 ? (purchases / trials) * 100 : null,
      revenue: Number(r.revenue ?? 0),
    }
  })
}

// ─── 3) أداء حملات UTM (ربط UTM Builder بالإسناد) ────────────────────

/** أداء آخر 30 يوماً لكل حملة (utm_campaign) — للعرض في مكتبة الحملات */
export async function getCampaignPerformance(db: DbLike, campaigns: string[]): Promise<Record<string, { registrations: number; purchases: number; revenue: number }>> {
  if (!campaigns.length) return {}
  const list = Prisma.join(campaigns.map((c) => Prisma.sql`${c}`), ', ')
  const rows: Array<Record<string, unknown>> = await db.$queryRaw`
    WITH ev AS (
      SELECT DISTINCT t."eventId", t."eventName", t."subscriptionId"
      FROM "TrackingEvent" t
      WHERE t."createdAt" >= NOW() - INTERVAL '30 days'
    )
    SELECT
      LOWER(COALESCE(ua."firstTouchCampaign", '')) AS camp,
      COUNT(DISTINCT CASE WHEN e."eventName" = 'CompleteRegistration' THEN e."eventId" END)::int AS registrations,
      COUNT(DISTINCT CASE WHEN e."eventName" = 'Purchase' THEN e."eventId" END)::int AS purchases,
      COALESCE(SUM(CASE WHEN e."eventName" = 'Purchase' THEN s."amountPaid" END), 0)::float AS revenue
    FROM ev e
    LEFT JOIN "Subscription" s ON s."id" = e."subscriptionId"
    LEFT JOIN "Tenant" tn ON tn."id" = s."tenantId"
    LEFT JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
    LEFT JOIN "UserAttribution" ua ON ua."userId" = u."id"
    WHERE LOWER(COALESCE(ua."firstTouchCampaign", '')) IN (${list})
      AND e."eventName" IN ('CompleteRegistration', 'Purchase')
    GROUP BY 1
  `
  const out: Record<string, { registrations: number; purchases: number; revenue: number }> = {}
  for (const r of rows) {
    out[String(r.camp)] = {
      registrations: Number(r.registrations ?? 0),
      purchases: Number(r.purchases ?? 0),
      revenue: Number(r.revenue ?? 0),
    }
  }
  return out
}
