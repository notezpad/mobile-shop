import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/billing-history
 *
 * 🛡️ 2026-10-10 (Plan Control): سجل تغييرات الباقات + ملخص المستحقات.
 *
 * Query params:
 *   - take      (default 80, max 300)
 *   - tenantId  (filter by tenant)
 *   - type      (switch | assign | renew | manual | trial)
 *   - due=1     (only rows with unsettled proration dues)
 *
 * Response: { items: [...], summary: { outstandingDue, outstandingCount,
 *            collectedDue } }
 *
 * PATCH /api/admin/billing-history
 *
 * Body: { id: number, settled: boolean, method?: string, note?: string }
 * Marks a proration due as collected (or reopens it) after the platform
 * owner actually collects the upgrade difference (cash / vodafone / ...).
 */

const CHANGE_TYPES = ['switch', 'assign', 'renew', 'manual', 'trial']

async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const takeRaw = Number(url.searchParams.get('take') ?? 80)
  const take = Math.min(300, Math.max(1, Number.isNaN(takeRaw) ? 80 : takeRaw))
  const tenantId = url.searchParams.get('tenantId') ?? ''
  const type = url.searchParams.get('type') ?? ''
  const dueOnly = url.searchParams.get('due') === '1'

  const where: any = {}
  if (tenantId) where.tenantId = tenantId
  if (type && CHANGE_TYPES.includes(type)) where.changeType = type
  if (dueOnly) {
    where.amountDue = { gt: 0 }
    where.dueSettled = false
  }

  const [logs, outstanding, collected] = await Promise.all([
    db.planChangeLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { tenant: { select: { shopName: true } } },
    }),
    db.planChangeLog.aggregate({
      where: { amountDue: { gt: 0 }, dueSettled: false },
      _sum: { amountDue: true },
      _count: true,
    }),
    db.planChangeLog.aggregate({
      where: { dueSettled: true },
      _sum: { amountDue: true },
    }),
  ])

  // أسماء الباقات (human-readable) — نجمع الأكواد وننجلبها دفعة واحدة
  const codes = new Set<string>()
  for (const l of logs) {
    if (l.fromPlanCode) codes.add(l.fromPlanCode)
    if (l.toPlanCode) codes.add(l.toPlanCode)
  }
  const planRows =
    codes.size > 0
      ? await db.plan.findMany({
          where: { code: { in: [...codes] } },
          select: { code: true, name: true },
        })
      : []
  const planNameByCode = new Map(planRows.map((p) => [p.code, p.name]))

  const items = logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    tenantId: l.tenantId,
    shopName: l.tenant?.shopName ?? '—',
    changeType: l.changeType,
    period: l.period,
    fromPlanCode: l.fromPlanCode,
    fromPlanName: l.fromPlanCode ? planNameByCode.get(l.fromPlanCode) ?? l.fromPlanCode : null,
    toPlanCode: l.toPlanCode,
    toPlanName: l.toPlanCode ? planNameByCode.get(l.toPlanCode) ?? l.toPlanCode : null,
    amountPaid: l.amountPaid,
    amountDue: l.amountDue,
    dueSettled: l.dueSettled,
    settledAt: l.settledAt ? l.settledAt.toISOString() : null,
    settledMethod: l.settledMethod,
    creditValue: l.creditValue,
    creditDays: l.creditDays,
    remainingDays: l.remainingDays,
    note: l.note,
    actor: l.actor,
  }))

  return NextResponse.json({
    items,
    summary: {
      outstandingDue: Math.round((outstanding._sum.amountDue ?? 0) * 100) / 100,
      outstandingCount: outstanding._count ?? 0,
      collectedDue: Math.round((collected._sum.amountDue ?? 0) * 100) / 100,
    },
  })
}

async function __PATCH(req: NextRequest) {
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

  const id = Number(body.id)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'id مطلوب (رقم)' }, { status: 400 })
  }

  const existing = await db.planChangeLog.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
  }

  const settled = body.settled !== false
  const updated = await db.planChangeLog.update({
    where: { id },
    data: {
      dueSettled: settled,
      settledAt: settled ? new Date() : null,
      settledMethod: settled ? String(body.method ?? 'manual') : null,
    },
  })

  return NextResponse.json({
    ok: true,
    log: {
      id: updated.id,
      dueSettled: updated.dueSettled,
      settledAt: updated.settledAt ? updated.settledAt.toISOString() : null,
      settledMethod: updated.settledMethod,
    },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}
