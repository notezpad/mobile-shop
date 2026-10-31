import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql, isUniqueViolation } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'
import {
  isMonthStr,
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  resolveSellerRate,
  round2,
} from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

/**
 * 💰 (التحديث الثالث عشر) صرف عمولة بائع عن شهر — POST /api/commissions/payout
 * body: { userId, month, adjustments?, method?, note? }
 *
 * 🛡️ القواعد:
 *  - أدمن/مالك بس (requireAdmin) — الموظف حتى لو عنده صلاحية 'commissions'
 *    بيقرأ التقرير بس، الصرف قرار مالك.
 *  - كل الأرقام بتتحسب على السيرفر لحظة الصرف (لقطة نهائية) — من الـ API
 *    بيجي البائع والشهر والتعديلات اليدوية (+/-) بس.
 *  - قيد فريد (محل، بائع، شهر) → مستحيل صرف نفس الشهر مرتين حتى بتزامن
 *    جهازين (نفس درس idempotency الفواتير).
 *  - البائع اللي ما حققش تارجته → مفيش عمولة تصرف (بيترفض الطلب برسالة واضحة).
 *  - التسوية دي **سجل صرف** — مش حركة خزنة (الفلوس ممكن تتدفع كاش برا النظام
 *    أو مع الراتب). الطبقة المحاسبية على الخزنة تفضل قرار منفصل لاحقاً.
 *  - لو العمولة محجوزة جوه مسير رواتب (viaPayroll) → بتترفض (اتصرفت بالفعل).
 */
export async function POST(req: NextRequest) {
  let session: Session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  const userId = body?.userId ? String(body.userId) : ''
  if (!userId) {
    return NextResponse.json({ error: 'البائع مطلوب' }, { status: 400 })
  }
  if (!isMonthStr(body?.month)) {
    return NextResponse.json({ error: 'الشهر غير صالح (YYYY-MM)' }, { status: 400 })
  }
  const month = body.month

  let adjustments = Number(body?.adjustments ?? 0)
  if (!Number.isFinite(adjustments)) adjustments = 0
  adjustments = round2(adjustments)
  const method = body?.method ? String(body.method).slice(0, 32) : null
  const note = body?.note ? String(body.note).trim().slice(0, 300) : null

  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const todayMonth = dateStrInTz(new Date(), tz).slice(0, 7)
    if (month > todayMonth) {
      return NextResponse.json({ error: 'لا يمكن صرف عمولة شهر لم يبدأ بعد' }, { status: 400 })
    }

    // إعدادات المحل + البائع
    const [tenantRows, sellerRows] = await Promise.all([
      sql<{ sellerCommissionsEnabled: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "sellerCommissionsEnabled", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
      sql<{ id: string; name: string; active: boolean; isSeller: boolean; sellerCommissionRate: number | null; sellerCommissionTarget: number | null }[]>`
        SELECT "id", "name", "active", "isSeller", "sellerCommissionRate", "sellerCommissionTarget"
        FROM "User" WHERE "id" = ${userId} AND "tenantId" = ${session.tenantId} LIMIT 1`,
    ])
    const tenantCfg = tenantRows[0]
    if (!tenantCfg || tenantCfg.sellerCommissionsEnabled !== true) {
      return NextResponse.json({ error: 'ميزة عمولات البائعين متوقفة' }, { status: 400 })
    }
    const seller = sellerRows[0]
    if (!seller) {
      return NextResponse.json({ error: 'البائع غير موجود' }, { status: 404 })
    }

    // حساب لحظة الصرف (لقطة نهائية)
    const agg = await sellersMonthAggregates(sql, session.tenantId, month, tz)
    const nums = agg.get(userId) ?? {
      userId, invoices: 0, salesTotal: 0, returnsCount: 0, returnsTotal: 0, netBase: 0, grossCommission: 0,
    }
    const target = resolveSellerTarget(seller.sellerCommissionTarget, tenantCfg.sellerCommissionTarget)
    const { targetMet, commission } = applyTargetGate(nums.grossCommission, nums.netBase, target)
    if (!targetMet) {
      return NextResponse.json(
        {
          error: `البائع ${seller.name} ما حققش التارجت (حقق ${round2(nums.netBase)} من ${target}) — مفيش عمولة تتصرف`,
        },
        { status: 400 },
      )
    }
    const amount = round2(commission + adjustments)

    try {
      const rows = await sql<any[]>`
        INSERT INTO "CommissionPayout"
          ("tenantId", "userId", "month", "salesTotal", "returnsTotal", "netBase",
           "rate", "target", "targetMet", "adjustments", "amount",
           "viaPayroll", "method", "note", "paidById", "paidAt")
        VALUES
          (${session.tenantId}, ${userId}, ${month}, ${nums.salesTotal}, ${nums.returnsTotal}, ${nums.netBase},
           ${resolveSellerRate(seller.sellerCommissionRate, tenantCfg.sellerCommissionRate) ?? 0},
           ${target}, ${targetMet}, ${adjustments}, ${amount},
           false, ${method}, ${note}, ${session.userId}, NOW())
        RETURNING *`
      const payout = rows[0]
      await logAudit(
        {
          action: 'commissions.payout',
          targetType: 'commission_payout',
          targetId: payout.id,
          details: {
            month,
            seller: seller.name,
            salesTotal: nums.salesTotal,
            returnsTotal: nums.returnsTotal,
            netBase: nums.netBase,
            adjustments,
            amount,
            method,
          },
          actor: { id: session.userId },
        },
        req,
      )
      return NextResponse.json({ ok: true, payout }, { status: 201 })
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { error: 'عمولة الشهر ده للبائع ده اتصرفت بالفعل' },
          { status: 409 },
        )
      }
      throw e
    }
  })
}
