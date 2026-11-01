import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { branchScopeSql } from '@/lib/branch-scope'
import { round2 } from '@/lib/purchase-return'

export const dynamic = 'force-dynamic'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — تقرير إغلاقات الورديات (للمدير).
 *
 * بيرجّع آخر إغلاقات الورديات بالجرد الأعمى: اللي الكاشير عدّاه، المتوقع
 * (رصيد الكاش الورقي للفرع لحظة الإغلاق — محسوب في السيرفر)، والفارق.
 * وكل إغلاق معاه «نافذة الوردية»: حركات الكاش بينه وبين الإغلاق اللي قبله
 * لنفس الفرع (داخل/خارج/صافي) — مجرد قراءة من دفتر الخزنة الموجود، من غير
 * أي كتابة جديدة.
 *
 * الصلاحية: موديول 'cash' (نفس صفحة الخزنة) — ومنscope الفرع: موظف فرع
 * بيشوف إغلاقات فرعه بس، والمدير يقدر يفلتر بـ ?branchId=<id>.
 */

interface ClosureRow {
  id: number
  branchId: number | null
  branchName: string | null
  shiftName: string | null
  userId: string | null
  userName: string | null
  counted: number
  expected: number
  variance: number
  note: string | null
  createdAt: Date
  windowFrom: Date | null
  // 🔗 (التحديث السادس عشر) جلسة الفتح المرتبطة (لو الإغلاق جاي بعد فتح رسمي)
  sessionShiftName: string | null
  sessionOpenedBy: string | null
  sessionOpenedAt: Date | null
  sessionOpeningFloat: number | null
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireModule(session, 'cash')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  return withSql(async (sql: Sql) => {
    const tid = session.tenantId
    const limit = Math.min(100, Math.max(10, parseInt(new URL(req.url).searchParams.get('limit') ?? '', 10) || 50))

    // 🏬 موظف الفرع: فرعه بس. المدير: الكل أو فلتر ?branchId=
    const reqBranch = new URL(req.url).searchParams.get('branchId')
    const filterBranch = session.branchId
      ? session.branchId
      : reqBranch && reqBranch !== 'all' && Number.isFinite(parseInt(reqBranch, 10))
        ? parseInt(reqBranch, 10)
        : null

    // نجيب limit+1 عشان أقدم إغلاق (اللي مش هيظهر) يبقى بداية نافذة أول
    // صف معروض — كده كل صف معروض ليه نافذة محسوبة.
    const rows = await sql<ClosureRow[]>`
      SELECT sc."id", sc."branchId", b."name" AS "branchName", sc."shiftName",
             sc."userId",
             (SELECT u."name" FROM "User" u WHERE u."id" = sc."userId") AS "userName",
             sc."counted", sc."expected", sc."variance", sc."note", sc."createdAt",
             ss."shiftName" AS "sessionShiftName",
             ss."userName" AS "sessionOpenedBy",
             ss."createdAt" AS "sessionOpenedAt",
             ss."openingFloat" AS "sessionOpeningFloat"
      FROM "ShiftClosure" sc
      LEFT JOIN "Branch" b ON b."id" = sc."branchId"
      LEFT JOIN "ShiftSession" ss ON ss."id" = sc."sessionId"
      WHERE sc."tenantId" = ${tid}
        AND ${branchScopeSql(sql, tid, filterBranch, 'sc."branchId"')}
      ORDER BY sc."id" DESC
      LIMIT ${limit + 1}`

    if (rows.length === 0) {
      return NextResponse.json({ closures: [] })
    }

    const mainRow = await sql<{ id: number | null }[]>`
      SELECT "id" FROM "Branch" WHERE "tenantId" = ${tid} AND "isMain" = true LIMIT 1`
    const mainId = mainRow[0]?.id ?? null
    // القيود غير المسندة (branchId NULL) بتتحسب على الفرع الرئيسي — نفس قاعدة الخزنة
    const eff = (bid: number | null) => bid ?? mainId

    // ── نافذة كل إغلاق: من الإغلاق اللي قبله لنفس الفرع، لحد إغلاقه هو.
    // 🔗 لو الإغلاق مرتبط بجلسة فتح رسمية — النافذة بتبدأ من وقت الفتح
    //    (نفس أساس حساب المتوقع بالظبط)
    const display = rows.slice(0, limit)
    const prevMap = new Map<number, Date>()
    for (const r of [...rows].reverse()) {
      const bid = eff(r.branchId)
      if (bid == null) continue
      r.windowFrom = prevMap.get(bid) ?? null
      prevMap.set(bid, r.createdAt)
    }
    for (const r of display) {
      if (r.sessionOpenedAt) r.windowFrom = new Date(r.sessionOpenedAt)
    }

    // ── حركات الكاش جوه النوافذ دي (استعلام واحد على كل المدى المطلوب)
    const bounds = display.filter((r) => r.windowFrom)
    const windows: Array<{
      id: number
      from: string | null
      to: string
      cashIn: number
      cashOut: number
      net: number
      count: number
    } | null> = display.map(() => null)

    if (bounds.length > 0) {
      const from = bounds.reduce((m, r) => (r.windowFrom! < m ? r.windowFrom! : m), bounds[0].windowFrom!)
      const to = display.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), display[0].createdAt)

      const entries = await sql<{ amount: number; branchId: number | null; createdAt: Date }[]>`
        SELECT "amount", "branchId", "createdAt"
        FROM "CashEntry"
        WHERE "tenantId" = ${tid}
          AND ("method" = 'cash' OR "method" IS NULL)
          AND "createdAt" > ${from} AND "createdAt" <= ${to}`

      // لكل فرع: نوافذه مرتبة من الأقدم — كل حركة بتقع في آخر نافذة
      // بدايتها قبل وقت الحركة (النوافذ متلاصقة بالتعريف).
      const byBranch = new Map<number, { from: number; idx: number }[]>()
      display.forEach((r, idx) => {
        const bid = eff(r.branchId)
        if (bid == null || !r.windowFrom) return
        const arr = byBranch.get(bid) ?? []
        arr.push({ from: r.windowFrom.getTime(), idx })
        byBranch.set(bid, arr)
      })
      for (const arr of byBranch.values()) arr.sort((a, b) => a.from - b.from)

      const acc = new Map<number, { cashIn: number; cashOut: number; count: number }>()
      for (const e of entries) {
        const bid = eff(e.branchId)
        const arr = byBranch.get(bid ?? -1)
        if (!arr) continue
        const t = new Date(e.createdAt).getTime()
        // آخر نافذة بدأت قبل الحركة (nافذة مفتوحة النهاية مش موجودة هنا —
        // كل الحركات ≤ أحدث إغلاق معروض)
        let hit = -1
        for (const w of arr) if (w.from < t) hit = w.idx
        if (hit < 0) continue
        const a = acc.get(hit) ?? { cashIn: 0, cashOut: 0, count: 0 }
        if (Number(e.amount) >= 0) a.cashIn += Number(e.amount)
        else a.cashOut += Number(e.amount)
        a.count += 1
        acc.set(hit, a)
      }

      display.forEach((r, idx) => {
        const a = acc.get(idx)
        if (!a) return
        windows[idx] = {
          id: r.id,
          from: r.windowFrom ? new Date(r.windowFrom).toISOString() : null,
          to: new Date(r.createdAt).toISOString(),
          cashIn: round2(a.cashIn),
          cashOut: round2(a.cashOut),
          net: round2(a.cashIn + a.cashOut),
          count: a.count,
        }
      })
    }

    return NextResponse.json({
      closures: display.map((r, idx) => ({
        id: r.id,
        branchId: r.branchId,
        branchName: r.branchName,
        shiftName: r.shiftName,
        userName: r.userName,
        counted: round2(r.counted),
        expected: round2(r.expected),
        variance: round2(r.variance),
        note: r.note,
        createdAt: new Date(r.createdAt).toISOString(),
        window: windows[idx],
        // 🔗 سجل المسؤولية الكامل: فتحها مين وإمتى والعهدة — والإغلاقات من
        // غير جلسة بترجع null (اتحسبت على رصيد الدرج الكامل — السلوك القديم)
        session: r.sessionShiftName
          ? {
              shiftName: r.sessionShiftName,
              openedBy: r.sessionOpenedBy,
              openedAt: r.sessionOpenedAt ? new Date(r.sessionOpenedAt).toISOString() : null,
              openingFloat:
                r.sessionOpeningFloat != null ? round2(Number(r.sessionOpeningFloat)) : null,
            }
          : null,
      })),
    })
  })
}
