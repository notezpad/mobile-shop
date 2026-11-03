import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql, isUniqueViolation } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import {
  isMonthStr,
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  resolveSellerRate,
  round2,
} from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

// وسائل الصرف اللي ليها درج/محفظة في الخزنة (نفس مجموعة المصروفات)
const CASH_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])
// فئة المصروف: عمولة البائع تكلفة عمالة — بتتجمع مع «مرتبات» (من القايمة المعتمدة)
const COMMISSION_EXPENSE_CATEGORY = 'مرتبات'

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
 *  - 💵 (التحديث 23) الصرف بيخصم من الخزنة افتراضياً: body.deductFromCash
 *    (الافتراضي true) → في نفس الـ transaction بيتسجل مصروف («مرتبات»،
 *    source='seller_commission') + حركة خزنة صادرة بنفس وسيلة الصرف.
 *    source='seller_commission' (مش 'commission': ده بتاع عمولة المحفظة وإيراد
 *    للمحل وداخل في صافي الربح — استخدامه كان هيحسب العمولة مرتين).
 *    deductFromCash=false = سجل بس (للدفع من برا النظام، زي تحويل بنكي).
 *    المبلغ الصفر/السالب (خصم) مفيهوش خروج فلوس → مفيش حركة خزنة.
 *    ملحوظة: الأساسي مفيهوش HR → الزر ده الطريق الوحيد لصرف العمولة هناك.
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
  // «مع الراتب» = العمولة هتتدفع مع المرتب برا النظام → سجل بس (من غير خروج فلوس دلوقتي).
  // (واجهات قديمة متخزنة في المتصفح ممكن لسه تبعت الوسيلة دي.)
  const deductFromCash = body?.deductFromCash !== false && method !== 'with_salary'
  if (deductFromCash && method !== null && !CASH_METHODS.has(method)) {
    return NextResponse.json({ error: 'وسيلة الصرف غير صالحة للخصم من الخزنة' }, { status: 400 })
  }
  const payMethod = method ?? (deductFromCash ? 'cash' : null)

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
      const { payout, expenseId, cashEntryId } = await sql.begin(async (tx) => {
        const rows = await tx<any[]>`
          INSERT INTO "CommissionPayout"
            ("tenantId", "userId", "month", "salesTotal", "returnsTotal", "netBase",
             "rate", "target", "targetMet", "adjustments", "amount",
             "viaPayroll", "method", "note", "paidById", "paidAt")
          VALUES
            (${session.tenantId}, ${userId}, ${month}, ${nums.salesTotal}, ${nums.returnsTotal}, ${nums.netBase},
             ${resolveSellerRate(seller.sellerCommissionRate, tenantCfg.sellerCommissionRate) ?? 0},
             ${target}, ${targetMet}, ${adjustments}, ${amount},
             false, ${payMethod}, ${note}, ${session.userId}, NOW())
          RETURNING *`
        const row = rows[0]
        let expId: number | null = null
        let ceId: number | null = null
        // 💵 خروج فلوس فعلي بس لو المبلغ موجب (الخصم/الصفر مفيهوش فلوس خارجة)
        if (deductFromCash && amount > 0) {
          const label = `عمولة ${seller.name} — ${month}`
          const exp = await tx<{ id: number }[]>`
            INSERT INTO "Expense"
              ("tenantId", "branchId", "category", "amount", "note", "userId", "source", "createdAt")
            VALUES
              (${session.tenantId}, ${session.branchId ?? null}, ${COMMISSION_EXPENSE_CATEGORY}, ${amount},
               ${`${label} (صرف #${row.id})`}, ${session.userId}, 'seller_commission', NOW())
            RETURNING "id"`
          expId = exp[0].id
          const ce = await tx<{ id: number }[]>`
            INSERT INTO "CashEntry"
              ("tenantId", "source", "refId", "amount", "note", "userId", "method", "branchId", "createdAt")
            VALUES
              (${session.tenantId}, 'seller_commission', ${row.id}, ${-amount},
               ${label}, ${session.userId}, ${payMethod}, ${session.branchId ?? null}, NOW())
            RETURNING "id"`
          ceId = ce[0].id
        }
        return { payout: row, expenseId: expId, cashEntryId: ceId }
      })
      // ⚡ قايمة المصروفات متخزنة في edge cache (20 ث) — نمسحها زي /api/expenses ورواتب HR
      if (expenseId !== null) {
        await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
      }
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
            method: payMethod,
            deductedFromCash: cashEntryId !== null,
            expenseId,
            cashEntryId,
          },
          actor: { id: session.userId },
        },
        req,
      )
      return NextResponse.json({ ok: true, payout, cashDeducted: cashEntryId !== null }, { status: 201 })
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

/**
 * 🔄 DELETE /api/commissions/payout?userId=…&month=YYYY-MM — إلغاء صرف عمولة (أدمن بس).
 *
 * الصرف لقطة نهائية (قيد فريد بائع/شهر) — فلو اتسجّل بالغلط أو بدري (البائع باع
 * بعده) مكانش فيه طريق غير الدعم الفني. الإلغاء بيفتح الشهر تاني للصرف.
 *
 *  - مرفوض لو الصرف جاي من مسير الرواتب (viaPayroll) — ده بيتدار من كشف الرواتب.
 *  - لو الصرف كان خصم من الخزنة (حركة source='seller_commission' بـ refId=رقم الصرف):
 *    بنرجّع الفلوس بحركة موجبة بنفس وسيلة الدفع ونمسح المصروف المرتبط — نفس
 *    منطق إلغاء المصروف، وكله في transaction واحدة.
 *  - الصرفيات القديمة (من غير حركة خزنة) بتتلغي من غير أي أثر على الخزنة.
 *  - الإلغاء بيتسجل في سجل التدقيق.
 */
export async function DELETE(req: NextRequest) {
  let session: Session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId') ?? ''
  const month = url.searchParams.get('month')
  if (!userId) {
    return NextResponse.json({ error: 'البائع مطلوب' }, { status: 400 })
  }
  if (!isMonthStr(month)) {
    return NextResponse.json({ error: 'الشهر غير صالح (YYYY-MM)' }, { status: 400 })
  }

  return withSql(async (sql) => {
    type Outcome =
      | { kind: 'notfound' }
      | { kind: 'payroll' }
      | { kind: 'ok'; payout: any; reversed: number | null }

    const out: Outcome = await sql.begin(async (tx) => {
      // قفل الصف: إلغاءين متزامنين مايعكسوش الخزنة مرتين
      const rows = await tx<any[]>`
        SELECT * FROM "CommissionPayout"
        WHERE "tenantId" = ${session.tenantId} AND "userId" = ${userId} AND "month" = ${month}
        FOR UPDATE`
      const payout = rows[0]
      if (!payout) return { kind: 'notfound' } as Outcome
      if (payout.viaPayroll) return { kind: 'payroll' } as Outcome

      let reversed: number | null = null
      const orig = await tx<{ amount: number; method: string | null; branchId: number | null }[]>`
        SELECT "amount"::float8 AS "amount", "method", "branchId" FROM "CashEntry"
        WHERE "tenantId" = ${session.tenantId} AND "source" = 'seller_commission'
          AND "refId" = ${payout.id} AND "amount" < 0
        ORDER BY "id" DESC LIMIT 1`
      if (orig[0]) {
        reversed = Math.abs(Number(orig[0].amount))
        await tx`
          INSERT INTO "CashEntry"
            ("tenantId", "source", "refId", "amount", "note", "userId", "method", "branchId", "createdAt")
          VALUES
            (${session.tenantId}, 'seller_commission', ${payout.id}, ${reversed},
             ${`إلغاء صرف عمولة (${month})`}, ${session.userId}, ${orig[0].method}, ${orig[0].branchId}, NOW())`
        await tx`
          DELETE FROM "Expense"
          WHERE "tenantId" = ${session.tenantId} AND "source" = 'seller_commission'
            AND "note" LIKE ${`%(صرف #${payout.id})`}`
      }
      await tx`DELETE FROM "CommissionPayout" WHERE "id" = ${payout.id} AND "tenantId" = ${session.tenantId}`
      return { kind: 'ok', payout, reversed } as Outcome
    })

    if (out.kind === 'notfound') {
      return NextResponse.json({ error: 'مفيش صرف مسجّل للبائع ده في الشهر ده' }, { status: 404 })
    }
    if (out.kind === 'payroll') {
      return NextResponse.json(
        { error: 'الصرف ده محجوز في مسير الرواتب — بيتعدّل من كشف الرواتب مش من هنا' },
        { status: 409 },
      )
    }
    if (out.reversed !== null) {
      await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
    }
    await logAudit(
      {
        action: 'commissions.payout.void',
        targetType: 'commission_payout',
        targetId: out.payout.id,
        details: {
          month,
          userId,
          amount: Number(out.payout.amount),
          method: out.payout.method,
          cashReversed: out.reversed,
        },
        actor: { id: session.userId },
      },
      req,
    )
    return NextResponse.json({ ok: true, cashReversed: out.reversed !== null })
  })
}
