import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuthIgnoreSubscription, authErrorResponse } from '@/lib/auth'
import { countableSubWhere } from '@/lib/subscription-status'
import { ALL_MODULES, getPlanContext } from '@/lib/features'
import { parseGraceDays, parseReminderDays, DAY_MS, GRACE_KEY, REMINDER_KEY } from '@/lib/subscription-settings'

export const dynamic = 'force-dynamic'

function parseArr(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch { /* ignore */ }
  return null
}

async function __GET() {
  let session
  try {
    // 🛡️ 2026-09-21: Use requireAuthIgnoreSubscription instead of requireAuth.
    // Previously this endpoint returned 402 (Subscription Expired) which meant
    // the SettingsView couldn't load the current subscription status — and
    // the user couldn't see they needed to redeem a code. Now the endpoint
    // always returns the subscription data (with expired: true when applicable)
    // so the user can see their status and apply a code.
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    if (err) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Super admin has no subscription — full access.
  if (session.role === 'SUPER_ADMIN') {
    return NextResponse.json({
      ok: true,
      tenantStatus: 'active',
      endDate: null,
      daysLeft: null,
      planName: 'منصة',
      planCode: 'platform',
      period: 'permanent',
      expired: false,
      expiringSoon: false,
      businessType: 'electronics',
      enabledModules: [...ALL_MODULES],
      capabilities: ['collections', 'multi_unit'],
    })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, status: true, shopName: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }

  const latestSub = await db.subscription.findFirst({
    // 🛡️ 2026-09-27: exclude 'pending'/'failed' rows — an unpaid Paymob
    // checkout attempt must not show as "30 days left".
    where: { tenantId: session.tenantId, ...countableSubWhere },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  })

  if (!latestSub) {
    return NextResponse.json({
      ok: true,
      tenantStatus: tenant.status,
      endDate: null,
      daysLeft: null,
      planName: '-',
      planCode: '-',
      period: '-',
      expired: tenant.status === 'expired',
      expiringSoon: false,
      businessType: 'electronics',
      enabledModules: [...ALL_MODULES],
      capabilities: [],
    })
  }

  const now = new Date()
  const daysLeft = Math.ceil(
    (latestSub.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  )
  // ⚙️ إعدادات الأدمن: فترة السماح + أقصى أيام تذكير (الافتراضي: 0 و7 = السلوك القديم)
  let graceDays = 0
  let reminderMax = 7
  try {
    const rows = await db.platformSetting.findMany({ where: { key: { in: [GRACE_KEY, REMINDER_KEY] } } })
    const m = new Map(rows.map((r) => [r.key, r.value]))
    graceDays = parseGraceDays(m.get(GRACE_KEY))
    reminderMax = Math.max(...parseReminderDays(m.get(REMINDER_KEY)))
  } catch { /* defaults */ }
  const inGrace =
    latestSub.status === 'active' &&
    latestSub.endDate < now &&
    now.getTime() <= latestSub.endDate.getTime() + graceDays * DAY_MS &&
    tenant.status !== 'expired'
  const graceDaysLeft = inGrace
    ? Math.max(0, Math.ceil((latestSub.endDate.getTime() + graceDays * DAY_MS - now.getTime()) / DAY_MS))
    : null
  const expired = (latestSub.endDate < now && !inGrace) || tenant.status === 'expired'
  // في فترة السماح بنظهر نفس الكارت (expiringSoon) برسالة مخصوصة بدل ما نقفل
  const expiringSoon = !expired && (inGrace || (daysLeft >= 0 && daysLeft <= reminderMax))

  // 🛡️ Use getPlanContext — automatically force-includes CRITICAL_MODULES
  // (settings, users, finance, expenses, cash, reports) regardless of plan.
  const ctx = await getPlanContext(session.tenantId)

  const res = NextResponse.json({
    ok: true,
    tenantStatus: tenant.status,
    endDate: latestSub.endDate.toISOString(),
    daysLeft,
    planName: latestSub.plan.name,
    planCode: latestSub.plan.code,
    period: latestSub.period,
    expired,
    expiringSoon,
    inGrace,
    graceDaysLeft,
    businessType: ctx.businessType,
    enabledModules: ctx.enabledModules,
    capabilities: ctx.capabilities,
  })
  // ⚡ Cache for 5 seconds only — short enough that fixes (e.g. plan
  // module changes deployed by the developer) take effect quickly without
  // requiring the user to hard-refresh. Previously this was 30 seconds
  // which meant users would still see old plan config up to 30s after a
  // deploy, leading to confusion ("I deployed but nothing changed").
  // 🛡️ FIX: same stale-cache class of bug as /api/auth/me — a cached
  // "subscription OK" response can outlive a logout by a few seconds.
  // Small window, but this endpoint is cheap (5-min sub_ok cookie already
  // does the real caching server-side), so no-store removes the risk
  // entirely instead of just shrinking it.
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
