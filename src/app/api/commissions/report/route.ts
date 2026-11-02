import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireCommissionsAccess, featureErrorResponse } from '@/lib/features'
import { withSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import {
  isMonthStr,
  shiftMonth,
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  resolveSellerRate,
  round2,
} from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

/**
 * 💰 (التحديث الثالث عشر) تقرير عمولات البائعين الشهري — GET /api/commissions/report?month=YYYY-MM
 *
 * 🛡️ كل الأرقام بتتحسب هنا من سجلات المبيعات/المرتجعات نفسها (مش من أي
 * رقم قادم من أي جهاز) — والبائعين بيتجمعوا من: المستخدمين المعلّمين
 * كـ«بائع» + أي حد عنده نشاط إسناد في الشهر حتى لو اتشال.
 * الصرف بيتسجل في CommissionPayout (قيد فريد لكل بائع/شهر) وحالته بترجع مع التقرير.
 */
export async function GET(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    requireCommissionsAccess(session)
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const { searchParams } = new URL(req.url)
  const monthParam = searchParams.get('month')
  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const month = isMonthStr(monthParam) ? monthParam : dateStrInTz(new Date(), tz).slice(0, 7)

    const [agg, userRows, payoutRows, tenantRows] = await Promise.all([
      sellersMonthAggregates(sql, session.tenantId, month, tz),
      sql<{ id: string; name: string; active: boolean; isSeller: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "id", "name", "active", "isSeller", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "User"
        WHERE "tenantId" = ${session.tenantId}
          AND ("isSeller" = true OR "id" IN (SELECT "sellerId" FROM "Sale" WHERE "tenantId" = ${session.tenantId} AND "sellerId" IS NOT NULL))
        ORDER BY "name" ASC`,
      sql<any[]>`
        SELECT "userId", "month", "salesTotal", "returnsTotal", "netBase", "rate", "target",
               "targetMet", "adjustments", "amount", "viaPayroll", "method", "note",
               "paidById", "paidAt", "createdAt"
        FROM "CommissionPayout"
        WHERE "tenantId" = ${session.tenantId} AND "month" = ${month}`,
      sql<{ sellerCommissionsEnabled: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "sellerCommissionsEnabled", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
    ])

    const tenantCfg = tenantRows[0] ?? { sellerCommissionsEnabled: false, sellerCommissionRate: null, sellerCommissionTarget: null }
    const payoutByUser = new Map<string, any>()
    for (const p of payoutRows) payoutByUser.set(String(p.userId), p)
    const userById = new Map(userRows.map((u) => [String(u.id), u]))

    // أي بائع له نشاط في الشهر ومش في قايمة المستخدمين (اتحذف مثلاً)
    for (const uid of agg.keys()) {
      if (!userById.has(uid)) userById.set(uid, { id: uid, name: 'مستخدم محذوف', active: false, isSeller: false, sellerCommissionRate: null, sellerCommissionTarget: null })
    }

    const sellers = [...userById.values()].map((u) => {
      const nums = agg.get(String(u.id)) ?? {
        userId: String(u.id), invoices: 0, salesTotal: 0, returnsCount: 0, returnsTotal: 0, netBase: 0, grossCommission: 0,
      }
      const target = resolveSellerTarget(u.sellerCommissionTarget, tenantCfg.sellerCommissionTarget)
      const { targetMet, commission } = applyTargetGate(nums.grossCommission, nums.netBase, target)
      const payout = payoutByUser.get(String(u.id)) ?? null
      return {
        userId: String(u.id),
        name: u.name,
        active: u.active,
        isSeller: u.isSeller,
        rate: resolveSellerRate(u.sellerCommissionRate, tenantCfg.sellerCommissionRate),
        target,
        invoices: nums.invoices,
        salesTotal: nums.salesTotal,
        returnsCount: nums.returnsCount,
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
      }
    })

    sellers.sort((a, b) => b.netBase - a.netBase || a.name.localeCompare(b.name, 'ar'))

    const totals = {
      invoices: sellers.reduce((s, r) => s + r.invoices, 0),
      salesTotal: round2(sellers.reduce((s, r) => s + r.salesTotal, 0)),
      returnsTotal: round2(sellers.reduce((s, r) => s + r.returnsTotal, 0)),
      netBase: round2(sellers.reduce((s, r) => s + r.netBase, 0)),
      commission: round2(sellers.reduce((s, r) => s + r.commission, 0)),
      paidAmount: round2(sellers.reduce((s, r) => s + (r.payout?.amount ?? 0), 0)),
    }

    return NextResponse.json(
      {
        month,
        currentMonth: dateStrInTz(new Date(), tz).slice(0, 7),
        // اليوم بتوقيت المحل (YYYY-MM-DD) — الواجهة بتستخدمه لتحديد «مبلغ مبدئي»
        today: dateStrInTz(new Date(), tz),
        prevMonth: shiftMonth(month, -1),
        nextMonth: shiftMonth(month, 1),
        enabled: tenantCfg.sellerCommissionsEnabled === true,
        sellers,
        totals,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
