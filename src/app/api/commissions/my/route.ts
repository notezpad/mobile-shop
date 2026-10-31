import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import {
  isMonthStr,
  shiftMonth,
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  resolveSellerRate,
} from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

/**
 * 💰 (التحديث الثالث عشر) «عمولتي» — GET /api/commissions/my?month=YYYY-MM
 *
 * البائع بيشوف **رقمه هو بس** (السيشن هو مصدر الهوية — مفيش userId من
 * الطلب خالص): مبيعات الشهر، التارجت ومدى التقدم، والعمولة التقديرية.
 * لو المالك قفل الميزة → enabled=false والواجهة بتخفي الكارت.
 */
export async function GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { searchParams } = new URL(req.url)
  const monthParam = searchParams.get('month')
  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const month = isMonthStr(monthParam) ? monthParam : dateStrInTz(new Date(), tz).slice(0, 7)

    const [agg, userRows, payoutRows, tenantRows] = await Promise.all([
      sellersMonthAggregates(sql, session.tenantId, month, tz),
      sql<{ id: string; name: string; isSeller: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "id", "name", "isSeller", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "User" WHERE "id" = ${session.userId} AND "tenantId" = ${session.tenantId} LIMIT 1`,
      sql<any[]>`
        SELECT "amount", "adjustments", "viaPayroll", "method", "note", "paidAt"
        FROM "CommissionPayout"
        WHERE "tenantId" = ${session.tenantId} AND "userId" = ${session.userId} AND "month" = ${month}
        LIMIT 1`,
      sql<{ sellerCommissionsEnabled: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "sellerCommissionsEnabled", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
    ])

    const tenantCfg = tenantRows[0] ?? { sellerCommissionsEnabled: false, sellerCommissionRate: null, sellerCommissionTarget: null }
    const me = userRows[0] ?? null
    const nums = agg.get(session.userId) ?? {
      userId: session.userId, invoices: 0, salesTotal: 0, returnsCount: 0, returnsTotal: 0, netBase: 0, grossCommission: 0,
    }
    const target = me ? resolveSellerTarget(me.sellerCommissionTarget, tenantCfg.sellerCommissionTarget) : null
    const { targetMet, commission } = applyTargetGate(nums.grossCommission, nums.netBase, target)
    const payout = payoutRows[0] ?? null

    return NextResponse.json(
      {
        month,
        prevMonth: shiftMonth(month, -1),
        nextMonth: shiftMonth(month, 1),
        enabled: tenantCfg.sellerCommissionsEnabled === true,
        isSeller: me?.isSeller === true,
        name: me?.name ?? null,
        rate: me ? resolveSellerRate(me.sellerCommissionRate, tenantCfg.sellerCommissionRate) : null,
        target,
        invoices: nums.invoices,
        salesTotal: nums.salesTotal,
        returnsTotal: nums.returnsTotal,
        netBase: nums.netBase,
        commission,
        targetMet,
        payout: payout
          ? {
              amount: Number(payout.amount) || 0,
              adjustments: Number(payout.adjustments) || 0,
              viaPayroll: payout.viaPayroll === true,
              method: payout.method ?? null,
              note: payout.note ?? null,
              paidAt: payout.paidAt,
            }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
