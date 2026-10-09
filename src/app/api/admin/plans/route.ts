import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse, PLATFORM_TENANT_ID } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __GET() {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // 🛡️ 2026-09-17 (v3): Show ALL plans (canonical + custom) in the admin
  // UI. Previously filtered to canonical-only, which meant any custom plan
  // created by the admin would "disappear" after creation (POST saves it
  // but GET doesn't return it). Now we show everything and let the admin
  // manage all plans.
  const CANONICAL_PLAN_CODES = [
    'electronics-basic',
    'electronics-pro',
    'fashion-basic',
    'fashion-pro',
  ]

  // 🎨 2026-10-09 (plans redesign): richer per-plan analytics for the admin
  // UI — period split, trials, MRR, expiring-soon and the next-to-expire
  // subscribers. All additive: every pre-existing field is unchanged.
  const now = new Date()
  const expiringLimit = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const plans = await db.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      subscriptions: {
        where: {
          status: 'active',
          tenant: { id: { not: PLATFORM_TENANT_ID } },
        },
        select: {
          id: true,
          period: true,
          endDate: true,
          tenant: { select: { shopName: true } },
        },
        orderBy: { endDate: 'asc' },
      },
    },
  })

  const rows = plans.map((p) => {
    const subs = p.subscriptions
    const trialCount = subs.filter((s) => s.period === 'trial').length
    const yearlyCount = subs.filter((s) => s.period === 'yearly').length
    const monthlyCount = subs.length - trialCount - yearlyCount
    // Estimated monthly recurring revenue: trials pay nothing, yearly subs
    // contribute priceYearly / 12, everything else the monthly price.
    const mrr = Math.round(
      monthlyCount * p.priceMonthly + (yearlyCount * p.priceYearly) / 12
    )
    const expiringSoonCount = subs.filter(
      (s) => s.endDate >= now && s.endDate <= expiringLimit
    ).length

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      maxUsers: p.maxUsers,
      maxProducts: p.maxProducts,
      maxBranches: p.maxBranches,
      trialDays: p.trialDays,
      features: p.features,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      subscribersCount: subs.length,
      businessType: (p as any).businessType ?? null,
      enabledModules: (p as any).enabledModules ?? null,
      capabilities: (p as any).capabilities ?? null,
      // 🛡️ 2026-09-17 (v3): flag to distinguish canonical vs custom plans
      isCanonical: CANONICAL_PLAN_CODES.includes(p.code),
      // ── new analytics fields ──
      trialCount,
      monthlyCount,
      yearlyCount,
      mrr,
      expiringSoonCount,
      nextExpiring: subs.slice(0, 5).map((s) => ({
        id: s.id,
        shopName: s.tenant?.shopName ?? '—',
        period: s.period,
        endDate: s.endDate.toISOString(),
      })),
    }
  })

  return NextResponse.json({ items: rows })
}

async function __POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const code = String(body.code ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  if (!code || !name) {
    return NextResponse.json({ error: 'الكود والاسم مطلوبان' }, { status: 400 })
  }

  const exists = await db.plan.findUnique({ where: { code } })
  if (exists) {
    return NextResponse.json({ error: 'كود الباقة موجود بالفعل' }, { status: 400 })
  }

  const features = Array.isArray(body.features)
    ? JSON.stringify(body.features)
    : typeof body.features === 'string'
      ? JSON.stringify(
          String(body.features)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : null

  const plan = await db.plan.create({
    data: {
      code,
      name,
      description: body.description ? String(body.description) : null,
      priceMonthly: Number(body.priceMonthly ?? 0) || 0,
      priceYearly: Number(body.priceYearly ?? 0) || 0,
      maxUsers: Number(body.maxUsers ?? 1) || 1,
      maxProducts: Number(body.maxProducts ?? 50) || 50,
      maxBranches: Number(body.maxBranches ?? 1) || 1,
      trialDays: Number(body.trialDays ?? 0) || 0,
      features,
      isActive: body.isActive !== false,
      sortOrder: Number(body.sortOrder ?? 0) || 0,
      ...(body.businessType ? { businessType: String(body.businessType) } : {}),
      ...(body.capabilities !== undefined ? {
        capabilities: typeof body.capabilities === 'string'
          ? body.capabilities
          : Array.isArray(body.capabilities)
            ? JSON.stringify(body.capabilities)
            : null
      } : {}),
      // 🛡️ 2026-09-15 (v2): handle enabledModules — previously POST silently
      // ignored this field, so the admin couldn't change which modules a
      // plan unlocks.
      ...(body.enabledModules !== undefined ? {
        enabledModules: typeof body.enabledModules === 'string'
          ? body.enabledModules
          : Array.isArray(body.enabledModules)
            ? JSON.stringify(body.enabledModules)
            : null
      } : {}),
    } as any,
  })

  return NextResponse.json({ ok: true, plan })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
