import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { getTenantModules } from '@/lib/features'
import { logAudit } from '@/lib/audit'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import {
  isMonthStr,
  sellersMonthAggregates,
  applyTargetGate,
  resolveSellerTarget,
  round2,
} from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

// وسائل الصرف اللي ليها درج/محفظة في الخزنة (نفس مجموعة الصرف النهائي والمصروفات)
const CASH_METHODS = new Set(['cash', 'vodafone_cash', 'instapay', 'fawry'])
const COMMISSION_EXPENSE_CATEGORY = 'مرتبات'
// ⚠️ مصدر منفصل عن الصرف النهائي ('seller_commission'): الحركتين بيتربطوا بـ refId = رقم السجل،
// ورقم دفعة ورقم صرف ممكن يتطابقوا — لو المصدر واحد، إلغاء صرف كان ممكن يلمس دفعة والعكس.
const ADVANCE_SOURCE = 'seller_commission_advance'

/**
 * 💵 (التحديث 24) دفعات مقدمة من العمولة — /api/commissions/advance
 *
 * ليه: الصرف النهائي لقطة واحدة لكل بائع/شهر (قيد فريد). الدفعة المقدمة بتسمح
 * بصرف جزء قبل آخر الشهر من غير ما الشهر يتقفل. الصرف النهائي بعد كده بيخصم
 * مجموع الدفعات تلقائياً (شوف payout/route.ts).
 *
 * 🛡️ سلامة الرواتب (قرار صريح): الميزة دي **مقفولة على الباقات اللي فيها موديول hr**.
 *  - مسير الرواتب بيحسب عمولة الشهر كاملة في القسيمة، ومش عارف بالدفعات المقدمة →
 *    لو سمحنا بيها مع HR العمولة كانت هتتدفع مرتين. بدل ما نلمس hr-payroll.ts
 *    (اللي بيعتمد على القيد الفريد بتاع CommissionPayout) — الاحترافي بيستخدم «سلف الموظفين».
 *  - ولا جدول ولا ملف رواتب اتغيّر. الجدول الجديد منفصل تماماً.
 *
 * القواعد:
 *  - أدمن بس.
 *  - مش أكتر من العمولة المستحقة حالياً ناقص الدفعات السابقة (سلفة على اللي اتكسب بس).
 *  - مرفوضة لو الشهر اتصرف نهائياً (ألغي الصرف الأول).
 *  - بتخصم من الخزنة افتراضياً (مصروف + حركة خزنة صادرة) في transaction واحدة.
 *  - قفل advisory على (محل، بائع، شهر) — نفس القفل في الصرف النهائي — عشان دفعتين
 *    متزامنتين أو دفعة + صرف نهائي مايتخطوش الحد أو يتحسبوا غلط.
 */

type Adm = Session

async function adminOr401(): Promise<{ session: Adm } | { res: NextResponse }> {
  try {
    return { session: await requireAdmin() }
  } catch (e) {
    const err = authErrorResponse(e)
    return { res: NextResponse.json(err?.body, { status: err?.status }) }
  }
}

/** GET ?month=YYYY-MM → دفعات الشهر لكل البائعين */
export async function GET(req: NextRequest) {
  const a = await adminOr401()
  if ('res' in a) return a.res
  const session = a.session

  const month = new URL(req.url).searchParams.get('month')
  if (!isMonthStr(month)) {
    return NextResponse.json({ error: 'الشهر غير صالح (YYYY-MM)' }, { status: 400 })
  }
  return withSql(async (sql) => {
    const rows = await sql<
      { id: number; userId: string; amount: number; method: string | null; note: string | null; paidAt: Date }[]
    >`
      SELECT "id", "userId", "amount"::float8 AS "amount", "method", "note", "paidAt"
      FROM "CommissionAdvance"
      WHERE "tenantId" = ${session.tenantId} AND "month" = ${month}
      ORDER BY "id" ASC`
    return NextResponse.json({ advances: rows })
  })
}

/** POST { userId, month, amount, method?, note?, deductFromCash? } */
export async function POST(req: NextRequest) {
  const a = await adminOr401()
  if ('res' in a) return a.res
  const session = a.session

  const body = await req.json().catch(() => null)
  const userId = body?.userId ? String(body.userId) : ''
  if (!userId) return NextResponse.json({ error: 'البائع مطلوب' }, { status: 400 })
  if (!isMonthStr(body?.month)) {
    return NextResponse.json({ error: 'الشهر غير صالح (YYYY-MM)' }, { status: 400 })
  }
  const month: string = body.month
  const amount = round2(Number(body?.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'مبلغ الدفعة لازم يكون أكبر من صفر' }, { status: 400 })
  }
  const method = body?.method ? String(body.method).slice(0, 32) : null
  const note = body?.note ? String(body.note).trim().slice(0, 300) : null
  const deductFromCash = body?.deductFromCash !== false
  if (deductFromCash && method !== null && !CASH_METHODS.has(method)) {
    return NextResponse.json({ error: 'وسيلة الصرف غير صالحة للخصم من الخزنة' }, { status: 400 })
  }
  const payMethod = method ?? (deductFromCash ? 'cash' : null)

  // 🛡️ الباقات اللي فيها HR مستبعدة (شوف الشرح فوق)
  const modules = await getTenantModules(session.tenantId)
  if (modules.includes('hr')) {
    return NextResponse.json(
      {
        error:
          'باقتك فيها الموارد البشرية — العمولة بتتصرف مع كشف الرواتب، والسلفة بتتسجل من «سلف الموظفين» عشان تتخصم من القسيمة',
      },
      { status: 409 },
    )
  }

  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const todayMonth = dateStrInTz(new Date(), tz).slice(0, 7)
    if (month > todayMonth) {
      return NextResponse.json({ error: 'لا يمكن صرف دفعة عن شهر لم يبدأ بعد' }, { status: 400 })
    }

    const [tenantRows, sellerRows] = await Promise.all([
      sql<{ sellerCommissionsEnabled: boolean; sellerCommissionTarget: number | null }[]>`
        SELECT "sellerCommissionsEnabled", "sellerCommissionTarget"
        FROM "Tenant" WHERE "id" = ${session.tenantId} LIMIT 1`,
      sql<{ id: string; name: string; sellerCommissionTarget: number | null }[]>`
        SELECT "id", "name", "sellerCommissionTarget"
        FROM "User" WHERE "id" = ${userId} AND "tenantId" = ${session.tenantId} LIMIT 1`,
    ])
    const tenantCfg = tenantRows[0]
    if (!tenantCfg || tenantCfg.sellerCommissionsEnabled !== true) {
      return NextResponse.json({ error: 'ميزة عمولات البائعين متوقفة' }, { status: 400 })
    }
    const seller = sellerRows[0]
    if (!seller) return NextResponse.json({ error: 'البائع غير موجود' }, { status: 404 })

    // العمولة المستحقة دلوقتي (نفس حساب الصرف النهائي)
    const agg = await sellersMonthAggregates(sql, session.tenantId, month, tz)
    const nums = agg.get(userId) ?? { netBase: 0, grossCommission: 0 }
    const target = resolveSellerTarget(seller.sellerCommissionTarget, tenantCfg.sellerCommissionTarget)
    const { targetMet, commission } = applyTargetGate(nums.grossCommission, nums.netBase, target)
    if (!targetMet) {
      return NextResponse.json(
        { error: `البائع ${seller.name} لسه ما حققش التارجت — مفيش عمولة مستحقة تتسلّف منها` },
        { status: 400 },
      )
    }

    type Out =
      | { kind: 'paid' }
      | { kind: 'over'; available: number }
      | { kind: 'ok'; id: number; expenseId: number | null; cashEntryId: number | null }

    const out: Out = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`${session.tenantId}:${userId}:${month}`}))`
      const payout = await tx`
        SELECT 1 FROM "CommissionPayout"
        WHERE "tenantId" = ${session.tenantId} AND "userId" = ${userId} AND "month" = ${month} LIMIT 1`
      if (payout.length > 0) return { kind: 'paid' } as Out

      const sumRow = await tx<{ s: number }[]>`
        SELECT COALESCE(SUM("amount"), 0)::float8 AS "s" FROM "CommissionAdvance"
        WHERE "tenantId" = ${session.tenantId} AND "userId" = ${userId} AND "month" = ${month}`
      const available = round2(commission - Number(sumRow[0]?.s ?? 0))
      if (amount > available + 0.001) return { kind: 'over', available: Math.max(0, available) } as Out

      const ins = await tx<{ id: number }[]>`
        INSERT INTO "CommissionAdvance"
          ("tenantId", "userId", "month", "amount", "method", "note", "paidById", "paidAt")
        VALUES
          (${session.tenantId}, ${userId}, ${month}, ${amount}, ${payMethod}, ${note}, ${session.userId}, NOW())
        RETURNING "id"`
      const id = ins[0].id
      let expenseId: number | null = null
      let cashEntryId: number | null = null
      if (deductFromCash) {
        const label = `دفعة مقدمة عمولة ${seller.name} — ${month}`
        const exp = await tx<{ id: number }[]>`
          INSERT INTO "Expense"
            ("tenantId", "branchId", "category", "amount", "note", "userId", "source", "createdAt")
          VALUES
            (${session.tenantId}, ${session.branchId ?? null}, ${COMMISSION_EXPENSE_CATEGORY}, ${amount},
             ${`${label} (دفعة #${id})`}, ${session.userId}, ${ADVANCE_SOURCE}, NOW())
          RETURNING "id"`
        expenseId = exp[0].id
        const ce = await tx<{ id: number }[]>`
          INSERT INTO "CashEntry"
            ("tenantId", "source", "refId", "amount", "note", "userId", "method", "branchId", "createdAt")
          VALUES
            (${session.tenantId}, ${ADVANCE_SOURCE}, ${id}, ${-amount},
             ${label}, ${session.userId}, ${payMethod}, ${session.branchId ?? null}, NOW())
          RETURNING "id"`
        cashEntryId = ce[0].id
      }
      return { kind: 'ok', id, expenseId, cashEntryId } as Out
    })

    if (out.kind === 'paid') {
      return NextResponse.json(
        { error: 'الشهر ده اتصرف نهائياً للبائع ده — ألغي الصرف الأول لو عايز تضيف دفعة' },
        { status: 409 },
      )
    }
    if (out.kind === 'over') {
      return NextResponse.json(
        { error: `الحد الأقصى للدفعة دلوقتي ${out.available} ج (العمولة المستحقة ناقص الدفعات السابقة)` },
        { status: 400 },
      )
    }
    if (out.expenseId !== null) {
      await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
    }
    await logAudit(
      {
        action: 'commissions.advance',
        targetType: 'commission_advance',
        targetId: out.id,
        details: {
          month,
          seller: seller.name,
          amount,
          method: payMethod,
          deductedFromCash: out.cashEntryId !== null,
          expenseId: out.expenseId,
          cashEntryId: out.cashEntryId,
        },
        actor: { id: session.userId },
      },
      req,
    )
    return NextResponse.json(
      { ok: true, id: out.id, cashDeducted: out.cashEntryId !== null },
      { status: 201 },
    )
  })
}

/** DELETE ?id=… → إلغاء دفعة مقدمة (بيرجّع الفلوس للخزنة لو كانت متخصمة) */
export async function DELETE(req: NextRequest) {
  const a = await adminOr401()
  if ('res' in a) return a.res
  const session = a.session

  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  return withSql(async (sql) => {
    type Out =
      | { kind: 'notfound' }
      | { kind: 'paid' }
      | { kind: 'ok'; adv: { userId: string; month: string; amount: number; method: string | null }; reversed: number | null }

    const out: Out = await sql.begin(async (tx) => {
      const first = await tx<{ userId: string; month: string }[]>`
        SELECT "userId", "month" FROM "CommissionAdvance"
        WHERE "id" = ${id} AND "tenantId" = ${session.tenantId}`
      if (!first[0]) return { kind: 'notfound' } as Out
      // نفس القفل بتاع إضافة دفعة والصرف النهائي → مفيش تسابق بين الإلغاء والصرف
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`${session.tenantId}:${first[0].userId}:${first[0].month}`}))`
      const rows = await tx<{ userId: string; month: string; amount: number; method: string | null }[]>`
        SELECT "userId", "month", "amount"::float8 AS "amount", "method" FROM "CommissionAdvance"
        WHERE "id" = ${id} AND "tenantId" = ${session.tenantId} FOR UPDATE`
      const adv = rows[0]
      if (!adv) return { kind: 'notfound' } as Out

      // لو الشهر اتصرف نهائياً، الصرف خصم الدفعة من صافيه — إلغاؤها هنا هيبوّظ الحساب
      const payout = await tx`
        SELECT 1 FROM "CommissionPayout"
        WHERE "tenantId" = ${session.tenantId} AND "userId" = ${adv.userId} AND "month" = ${adv.month} LIMIT 1`
      if (payout.length > 0) return { kind: 'paid' } as Out

      let reversed: number | null = null
      const orig = await tx<{ amount: number; method: string | null; branchId: number | null }[]>`
        SELECT "amount"::float8 AS "amount", "method", "branchId" FROM "CashEntry"
        WHERE "tenantId" = ${session.tenantId} AND "source" = ${ADVANCE_SOURCE}
          AND "refId" = ${id} AND "amount" < 0
        ORDER BY "id" DESC LIMIT 1`
      if (orig[0]) {
        reversed = Math.abs(Number(orig[0].amount))
        await tx`
          INSERT INTO "CashEntry"
            ("tenantId", "source", "refId", "amount", "note", "userId", "method", "branchId", "createdAt")
          VALUES
            (${session.tenantId}, ${ADVANCE_SOURCE}, ${id}, ${reversed},
             ${`إلغاء دفعة مقدمة عمولة (${adv.month})`}, ${session.userId}, ${orig[0].method}, ${orig[0].branchId}, NOW())`
        await tx`
          DELETE FROM "Expense"
          WHERE "tenantId" = ${session.tenantId} AND "source" = ${ADVANCE_SOURCE}
            AND "note" LIKE ${`%(دفعة #${id})`}`
      }
      await tx`DELETE FROM "CommissionAdvance" WHERE "id" = ${id} AND "tenantId" = ${session.tenantId}`
      return { kind: 'ok', adv, reversed } as Out
    })

    if (out.kind === 'notfound') {
      return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
    }
    if (out.kind === 'paid') {
      return NextResponse.json(
        { error: 'الشهر ده اتصرف نهائياً وخصم الدفعة من صافيه — ألغي صرف الشهر الأول' },
        { status: 409 },
      )
    }
    if (out.reversed !== null) {
      await purgeEdgeCache([PURGE_KEYS.expensesDefault], session.tenantId, '1').catch(() => {})
    }
    await logAudit(
      {
        action: 'commissions.advance.void',
        targetType: 'commission_advance',
        targetId: id,
        details: {
          month: out.adv.month,
          userId: out.adv.userId,
          amount: Number(out.adv.amount),
          method: out.adv.method,
          cashReversed: out.reversed,
        },
        actor: { id: session.userId },
      },
      req,
    )
    return NextResponse.json({ ok: true, cashReversed: out.reversed !== null })
  })
}
