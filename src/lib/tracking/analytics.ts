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
 *
 * ⚠️ إصلاح 42601 (2026-10-08) — مهم جداً لبيئة Cloudflare Workers:
 * ────────────────────────────────────────────────────────────────────
 * كانت هذه الاستعلامات تُبنى بـ $queryRaw + أجزاء Prisma.sql/Prisma.raw/
 * Prisma.empty المتراكبة. عميل Prisma الـ WASM ('@prisma/client/wasm'
 * المستخدم في workerd) يُفسد تسلسل الأجزاء المتراكبة: يحوّلها إلى
 * باراميترات $n بدل دمجها في نص SQL — فيصل إلى Postgres حرفياً:
 *     WITH $1 ev AS (...) SELECT ... $4 AS registrations ...
 * → Raw query failed. Code: 42601 — syntax error at or near "$1".
 * (محرك Node يدمجها صح، لذا كانت الاختبارات المحلية تمر بينما الإنتاج
 * يفشل — وهذا هو سبب «القمع يفشل فقط على Cloudflare».)
 *
 * الحل هنا: نصوص SQL مسطّحة تُبنى كنص واحد + باراميترات قياسية فقط
 * (نص/تاريخ/عدد) عبر $queryRawUnsafe — لا يمر بأي تسطيح أجزاء، فهو
 * آمن ومتطابق على المحركين (Node و WASM). كل المعرفات الديناميكية
 * تأتي من قوائم ثابتة برمجية (ليست مدخلات مستخدم) فلا حقن SQL.
 */

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

/** الحد الأدنى المطلوب من العميل — متوافق مع PrismaClient على المحركين */
type DbLike = { $queryRawUnsafe: (q: string, ...p: unknown[]) => Promise<any[]> }

// ─── باني الاستعلام المسطّح ──────────────────────────────────────────

/**
 * يجمع نص SQL وباراميتراته في خطوة واحدة: كل استدعاء p(value) يضيف
 * القيمة ويعيد العنصر النائب $n بترتيب ظهوره في النص — فلا يمكن أن
 * يختل الترتيب بين النص والقيم، ولا يوجد أي كائن Sql داخل القيم.
 */
class RawQuery {
  private parts: string[] = []
  readonly params: unknown[] = []

  add(text: string): this {
    this.parts.push(text)
    return this
  }

  /** يضيف باراميتراً قياسياً ويعيد عنصره النائب $n */
  p(value: unknown): string {
    this.params.push(value)
    return `$${this.params.length}`
  }

  text(): string {
    return this.parts.join('')
  }
}

// ─── مساعدات بناء الشروط (نصوص ثابتة فقط) ───────────────────────────

function touchCol(f: FunnelFilters, field: 'Source' | 'Medium' | 'Campaign'): string {
  return f.model === 'last' ? `lastTouch${field}` : `firstTouch${field}`
}

const hasAttrFilter = (f: FunnelFilters): boolean => !!(f.source || f.medium || f.campaign)

const DIRECT = '(مباشر)'
const NONE = '—'

/**
 * شروط مطابقة الإسناد (source/medium/campaign) — قيم الفلاتر تمر
 * كباراميترات، وأسماء الأعمدة من قائمة ثابتة (ليست مدخلات مستخدم).
 */
function attrConditionsText(q: RawQuery, f: FunnelFilters, alias: string): string {
  const conds: string[] = []
  if (f.source) conds.push(`LOWER(${alias}."${touchCol(f, 'Source')}") = LOWER(${q.p(f.source)})`)
  if (f.medium) conds.push(`LOWER(${alias}."${touchCol(f, 'Medium')}") = LOWER(${q.p(f.medium)})`)
  if (f.campaign) conds.push(`LOWER(${alias}."${touchCol(f, 'Campaign')}") = LOWER(${q.p(f.campaign)})`)
  return conds.join(' AND ')
}

/** شرط فلتر المنصة على عمود provider — باراميتر بسيط */
function platformCondText(q: RawQuery, f: FunnelFilters): string {
  if (!f.platform || f.platform === 'all') return ''
  return ` AND e."provider" = ${q.p(f.platform)}`
}

// ─── 1) القمع التحليلي ───────────────────────────────────────────────

export async function getFunnel(db: DbLike, f: FunnelFilters): Promise<FunnelResult> {
  const useAttr = hasAttrFilter(f)
  const q = new RawQuery()

  const fromP = q.p(new Date(f.from))
  const toP = q.p(new Date(f.to))

  q.add('WITH ')
  if (useAttr) {
    q.add(`attr AS (
        SELECT ua."userId" FROM "UserAttribution" ua WHERE ${attrConditionsText(q, f, 'ua')}
      ),
      `)
  }
  q.add(`ev AS (
      SELECT DISTINCT t."eventId", t."eventName", t."provider", t."subscriptionId"
      FROM "TrackingEvent" t
      WHERE t."createdAt" >= ${fromP}
        AND t."createdAt" < ${toP}
        AND t."eventName" IN ('PageView', 'CompleteRegistration', 'StartTrial', 'InitiateCheckout', 'Purchase')
    )
    SELECT`)

  const platform = platformCondText(q, f)
  const attrUser = useAttr ? ` AND u."id" IN (SELECT "userId" FROM attr)` : ''
  const attrReg = useAttr ? `\n          AND regexp_replace(e."eventId", '^signup-', '') IN (SELECT "userId" FROM attr)` : ''

  // الترتيب مهم: النص يُبنى بالتوازي مع ترقيم الباراميترات
  q.add(`
      (SELECT COUNT(*)::int FROM ev WHERE "eventName" = 'PageView') AS visitors,
      (SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
        WHERE e."eventName" = 'CompleteRegistration'${platform}${attrReg}) AS registrations,`)

  const stage = (eventName: string, alias: string): string => `
      (SELECT COUNT(DISTINCT e."eventId")::int FROM ev e
          JOIN "Subscription" s ON s."id" = e."subscriptionId"
          JOIN "Tenant" tn ON tn."id" = s."tenantId"
          JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
          WHERE e."eventName" = ${q.p(eventName)}${platformCondText(q, f)}${attrUser}) AS ${alias}`

  q.add(stage('StartTrial', 'trials'))
  q.add(',')
  q.add(stage('InitiateCheckout', 'checkouts'))
  q.add(',')
  q.add(stage('Purchase', 'purchases'))

  const rows: Array<Record<string, number>> = await db.$queryRawUnsafe(q.text(), ...q.params)

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
  const q = new RawQuery()

  const fromP = q.p(new Date(f.from))
  const toP = q.p(new Date(f.to))

  const srcColName = touchCol(f, 'Source')
  const medColName = touchCol(f, 'Medium')
  const campColName = touchCol(f, 'Campaign')

  /**
   * أعمدة التصنيف تتبع نموذج الإسناد (first/last touch).
   * ملاحظة: التصنيف والفلاتر كلاهما يتبع نموذج الإسناد المختار.
   */
  const groupCols = (alias: string): string =>
    `COALESCE(${alias}."${srcColName}", ${q.p(DIRECT)}) AS src,
               COALESCE(${alias}."${medColName}", ${q.p(NONE)}) AS med,
               COALESCE(${alias}."${campColName}", ${q.p(NONE)}) AS camp`

  // ربط بجدول الإسناد: مع فلاتر → INNER مع شروط، بدون → LEFT محافظ
  const uaJoin = (userCol: string): string =>
    useAttr
      ? `JOIN ua ON ua."userId" = ${userCol} AND ${attrConditionsText(q, f, 'ua')}`
      : `LEFT JOIN ua ON ua."userId" = ${userCol}`

  q.add(`WITH ua AS (SELECT * FROM "UserAttribution"),
    ev AS (
      SELECT DISTINCT t."eventId", t."eventName", t."provider", t."subscriptionId"
      FROM "TrackingEvent" t
      WHERE t."createdAt" >= ${fromP} AND t."createdAt" < ${toP}
    ),
    g_regs AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT re."userId")::int AS registrations
      FROM (
        SELECT DISTINCT regexp_replace(e."eventId", '^signup-', '') AS "userId"
        FROM ev e WHERE e."eventName" = 'CompleteRegistration'${platformCondText(q, f)}
      ) re
      ${uaJoin('re."userId"')}
      GROUP BY 1, 2, 3
    ),`)
  q.add(`
    g_trials AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT e."eventId")::int AS trials
      FROM ev e
      JOIN "Subscription" s ON s."id" = e."subscriptionId"
      JOIN "Tenant" tn ON tn."id" = s."tenantId"
      JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
      ${uaJoin('u."id"')}
      WHERE e."eventName" = 'StartTrial'${platformCondText(q, f)}
      GROUP BY 1, 2, 3
    ),`)
  q.add(`
    g_checkouts AS (
      SELECT ${groupCols('ua')}, COUNT(DISTINCT e."eventId")::int AS checkouts
      FROM ev e
      JOIN "Subscription" s ON s."id" = e."subscriptionId"
      JOIN "Tenant" tn ON tn."id" = s."tenantId"
      JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
      ${uaJoin('u."id"')}
      WHERE e."eventName" = 'InitiateCheckout'${platformCondText(q, f)}
      GROUP BY 1, 2, 3
    ),`)
  q.add(`
    g_purch AS (
      SELECT src, med, camp, COUNT(*)::int AS purchases, SUM(amount)::float AS revenue
      FROM (
        SELECT DISTINCT ON (e."eventId")
          e."eventId", s."amountPaid" AS amount,
          COALESCE(ua."${srcColName}", ${q.p(DIRECT)}) AS src,
          COALESCE(ua."${medColName}", ${q.p(NONE)}) AS med,
          COALESCE(ua."${campColName}", ${q.p(NONE)}) AS camp
        FROM ev e
        JOIN "Subscription" s ON s."id" = e."subscriptionId"
        JOIN "Tenant" tn ON tn."id" = s."tenantId"
        JOIN "User" u ON u."tenantId" = tn."id" AND u."email" = tn."ownerEmail"
        ${uaJoin('u."id"')}
        WHERE e."eventName" = 'Purchase'${platformCondText(q, f)}
      ) x
      GROUP BY src, med, camp
    )`)
  q.add(`
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
    FULL OUTER JOIN g_purch pu ON pu.src = COALESCE(r.src, t.src, c.src) AND pu.med = COALESCE(r.med, t.med, c.med) AND pu.camp = COALESCE(r.camp, t.camp, c.camp)`)

  // الترتيب — بعناصر ثابتة فقط (لا SQL injection)
  const sortMap: Record<string, string> = {
    purchases: 'purchases',
    revenue: 'revenue',
    trials: 'trials',
    registrations: 'registrations',
    conversion: '(COALESCE(pu.purchases, 0)::float / NULLIF(COALESCE(r.registrations, 0), 0))',
  }
  const orderBy = sortMap[f.sortBy ?? 'registrations'] ?? sortMap.registrations
  const dir = f.order === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500)

  q.add(` ORDER BY ${orderBy} ${dir} NULLS LAST LIMIT ${q.p(limit)}`)

  const rows: Array<Record<string, unknown>> = await db.$queryRawUnsafe(q.text(), ...q.params)

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
  try {
    return await campaignPerformanceRaw(db, campaigns)
  } catch {
    // المسار الخام خاص بـ PostgreSQL (NOW()/regexp_replace/CASTs) — على أي
    // محرك آخر (مثل SQLite في بيئة المعاينة) نستخدم مسار ORM المكافئ
    // تماماً بنفس دلالات العدّ (نمط getFunnelFallback أعلاه).
    return campaignPerformanceOrm(db as any, campaigns)
  }
}

async function campaignPerformanceRaw(db: DbLike, campaigns: string[]): Promise<Record<string, { registrations: number; purchases: number; revenue: number }>> {
  const q = new RawQuery()
  const list = campaigns.map((c) => q.p(c)).join(', ')
  q.add(`WITH ev AS (
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
    LEFT JOIN "UserAttribution" ua ON ua."userId" = (
      CASE WHEN e."eventName" = 'CompleteRegistration'
        THEN regexp_replace(e."eventId", '^signup-', '')
        ELSE u."id" END
    )
    WHERE LOWER(COALESCE(ua."firstTouchCampaign", '')) IN (${list})
      AND e."eventName" IN ('CompleteRegistration', 'Purchase')
    GROUP BY 1`)

  const rows: Array<Record<string, unknown>> = await db.$queryRawUnsafe(q.text(), ...q.params)

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

/**
 * مسار ORM مكافئ لـ campaignPerformanceRaw — نفس دلالات العدّ حرفياً:
 *   - أحداث آخر 30 يوماً مُكرَّرة Dedup على (eventId, eventName, subscriptionId)
 *   - Registrations: userId مقتطع من eventId بالصيغة signup-<userId>
 *   - Purchases: subscriptionId → Subscription → Tenant(ownerEmail) → User
 *   - التصنيف بـ firstTouchCampaign (lowercase) بغض النظر عن status
 *   - revenue = مجموع amountPaid لأحداث Purchase المُكرَّرة (مرة لكل حدث)
 */
async function campaignPerformanceOrm(db: any, campaigns: string[]): Promise<Record<string, { registrations: number; purchases: number; revenue: number }>> {
  const wanted = new Set(campaigns.map((c) => c.toLowerCase()))
  const since = new Date(Date.now() - 30 * 864e5)

  const evRows: Array<{ eventId: string; eventName: string; subscriptionId: number | null }> =
    await db.trackingEvent.findMany({
      where: { createdAt: { gte: since }, eventName: { in: ['CompleteRegistration', 'Purchase'] } },
      select: { eventId: true, eventName: true, subscriptionId: true },
      take: 50000,
    })
  const seen = new Set<string>()
  const events = evRows.filter((e) => {
    const key = `${e.eventId}|${e.eventName}|${e.subscriptionId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!events.length) return {}

  // resolved userId لكل حدث
  const purchaseSubIds = new Set<number>()
  for (const e of events) {
    if (e.eventName === 'Purchase' && e.subscriptionId != null) purchaseSubIds.add(e.subscriptionId)
  }
  const subToUser = new Map<number, string>()
  if (purchaseSubIds.size) {
    const subs = await db.subscription.findMany({
      where: { id: { in: [...purchaseSubIds] } },
      select: { id: true, tenant: { select: { id: true, ownerEmail: true } } },
      take: 1000,
    })
    const tenantIds = [...new Set(subs.map((s: any) => s.tenant.id))]
    const users = await db.user.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true, tenantId: true, email: true },
      take: 2000,
    })
    for (const s of subs) {
      const u = users.find((x: any) => x.tenantId === s.tenant.id && x.email === s.tenant.ownerEmail)
      if (u) subToUser.set(s.id, u.id)
    }
  }

  const userIds = new Set<string>()
  for (const e of events) {
    if (e.eventName === 'CompleteRegistration' && e.eventId.startsWith('signup-')) {
      userIds.add(e.eventId.slice('signup-'.length))
    }
  }
  for (const uid of subToUser.values()) userIds.add(uid)
  const userCamp = new Map<string, string>()
  if (userIds.size) {
    const attrs = await db.userAttribution.findMany({
      where: { userId: { in: [...userIds] } },
      select: { userId: true, firstTouchCampaign: true },
      take: 5000,
    })
    for (const a of attrs) {
      if (a.firstTouchCampaign) userCamp.set(a.userId, a.firstTouchCampaign.toLowerCase())
    }
  }

  // تجميع
  const regIds = new Map<string, Set<string>>()
  const purIds = new Map<string, Set<string>>()
  const purAmount = new Map<string, Map<string, number>>()
  const amounts = new Map<number, number | null>()
  if (subToUser.size) {
    const subs = await db.subscription.findMany({
      where: { id: { in: [...subToUser.keys()] } },
      select: { id: true, amountPaid: true },
      take: 1000,
    })
    for (const s of subs) amounts.set(s.id, s.amountPaid ?? null)
  }
  for (const e of events) {
    const uid = e.eventName === 'CompleteRegistration'
      ? (e.eventId.startsWith('signup-') ? e.eventId.slice('signup-'.length) : '')
      : (e.subscriptionId != null ? subToUser.get(e.subscriptionId) : undefined)
    const camp = uid ? userCamp.get(uid) : undefined
    if (!camp || !wanted.has(camp)) continue
    if (e.eventName === 'CompleteRegistration') {
      if (!regIds.has(camp)) regIds.set(camp, new Set())
      regIds.get(camp)!.add(e.eventId)
    } else {
      if (!purIds.has(camp)) purIds.set(camp, new Set())
      purIds.get(camp)!.add(e.eventId)
      if (!purAmount.has(camp)) purAmount.set(camp, new Map())
      // أول حدث فقط يحسب المبلغ (Dedup eventId كما في COUNT/SUM الخام)
      if (!purAmount.get(camp)!.has(e.eventId)) {
        purAmount.get(camp)!.set(e.eventId, e.subscriptionId != null ? (amounts.get(e.subscriptionId) ?? 0) : 0)
      }
    }
  }

  const out: Record<string, { registrations: number; purchases: number; revenue: number }> = {}
  for (const camp of wanted) {
    const regs = regIds.get(camp)?.size ?? 0
    const purs = purIds.get(camp)?.size ?? 0
    const rev = purs ? [...(purAmount.get(camp)?.values() ?? [])].reduce((a, b) => a + b, 0) : 0
    if (regs || purs) out[camp] = { registrations: regs, purchases: purs, revenue: rev }
  }
  return out
}
