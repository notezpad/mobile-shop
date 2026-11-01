import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireShiftCloseAccess, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { branchScopeSql } from '@/lib/branch-scope'
import { round2 } from '@/lib/purchase-return'
import { normalizeShifts, type BranchShift } from '@/lib/branch-shifts'
import { sessionBaseline, sessionExpected } from '@/lib/shift-sessions'

export const dynamic = 'force-dynamic'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — إغلاق الوردية بالجرد الأعمى (Blind Count).
 *
 * الفكرة الأمنية: الكاشير لما يقفل وردية مايشوفش «المتوقع» خالص — بيكتب
 * اللي عدّاه في الدرج بس، والسيرفر هو اللي بيحسب المتوقع (رصيد الكاش الورقي
 * للفرع لحظة الإغلاق) والفارق، ويسجلهم في ShiftClosure باسمه. الرد بيبقى
 * {ok: true} فقط — مفيش أي رقم راجع للكاشير، عشان الجرد يفضل أعمى.
 *
 * «المتوقع» = SUM(CashEntry.amount) للفرع، method='cash' أو NULL فقط
 * (القيود القديمة قبل عمود method بتعتبر كاش — نفس افتراض صفحة الخزنة).
 * فودافون كاش/إنستاباي/البنك مش فلوس درج — متتحسبش في الجرد.
 *
 * GET  → فرع/فروع المستخدم + ورديات كل فرع (لتعبئة الدايلوج) + آخر إغلاق
 *        لكل فرع (اسم الوردية والوقت فقط — بدون أي مبالغ).
 *        🫥 (التحديث الحادي عشر): + مفتاح المالك blindCash — لما يكون متوقّف
 *        (الوضع التقليدي) بيرجّع كمان expectedCash لكل فرع عشان الكاشير
 *        يشوف المتوقع ويأكد عليه. مفعّل (الافتراضي) = مفيش أي رقم راجع.
 * POST → { branchId?, shiftName, counted, note? } → { ok: true }
 *        الحساب والفارق على السيرفر في الوضعين — المفتاح بيغير العرض بس.
 *
 * 🔗 (التحديث السادس عشر): لو الفرع عليه **وردية مفتوحة** (فتح رسمي من
 *        /api/shifts/open)، المتوقع بيتحسب على **الوردية نفسها**:
 *        عهدة الفتح (ألا آخر إغلاق للفرع، ألا صفر) + صافي حركات الكاش من
 *        وقت الفتح — عشان الفارق يرجع لوردية بعينها مش على الدرج الكامل
 *        (كذا كاشير على نفس الدرج = عجز الوردية اللي فاتت مبيتوّرش على اللي بعدها).
 *        الإغلاق بيقفل الجلسة ويربط نفسيه فيها (ShiftClosure.sessionId).
 *        من غير وردية مفتوحة = نفس السلوك القديم بالظبط (رصيد الدرج الكامل).
 *
 * الصلاحية: requireShiftCloseAccess — مدير، أو موظف من غير قيود، أو موظف
 * عنده 'shift_close'. الفرع: موظف الفرع بيقفل درج فرعه بس.
 */

interface BranchRow {
  id: number
  name: string
  isMain: boolean
  shifts: unknown
}

async function __GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    requireShiftCloseAccess(session)
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  return withSql(async (sql: Sql) => {
    const tid = session.tenantId

    // 🏬 موظف الفرع: فرعه بس (أو الفرع الرئيسي لو مش مسجّل عليه فرع).
    // المدير: كل الفروع — عشان يقدر يقفل وردية أي فرع من نقطة البيع بتاعته.
    const branches = session.branchId
      ? await sql<BranchRow[]>`
          SELECT "id", "name", "isMain", "shifts"
          FROM "Branch"
          WHERE "tenantId" = ${tid} AND "id" = ${session.branchId}
          ORDER BY "isMain" DESC, "id" ASC`
      : await sql<BranchRow[]>`
          SELECT "id", "name", "isMain", "shifts"
          FROM "Branch"
          WHERE "tenantId" = ${tid}
          ORDER BY "isMain" DESC, "id" ASC`

    let visible: BranchRow[] = branches
    if (!session.branchId && branches.length > 1) {
      // مدير/موظف بدون فرع: الفرع الأساسي هو الافتراضي (نفس قاعدة الخزنة)
      visible = [branches[0], ...branches.filter((b) => !b.isMain)]
    }

    // آخر إغلاق لكل فرع — اسم الوردية والوقت والمستخدم فقط، بدون مبالغ
    // 🔗 (v16): + counted — عشان الأساس الاحتياطي لمتوقع الوردية المفتوحة
    const lastRows = await sql<{
      branchId: number | null
      shiftName: string | null
      userName: string | null
      counted: number
      createdAt: Date
    }[]>`
      SELECT sc."branchId", sc."shiftName",
             (SELECT u."name" FROM "User" u WHERE u."id" = sc."userId") AS "userName",
             sc."counted", sc."createdAt"
      FROM "ShiftClosure" sc
      WHERE sc."tenantId" = ${tid}
      ORDER BY sc."id" DESC
      LIMIT 40`
    const lastByBranch = new Map<number, (typeof lastRows)[number]>()
    for (const r of lastRows) {
      if (r.branchId != null && !lastByBranch.has(r.branchId)) lastByBranch.set(r.branchId, r)
    }

    // 🫥 مفتاح المالك: الجرد الأعمى للخزينة مفعّل؟ (افتراضي: نعم)
    const tenantRows = await sql<{ blindCashEnabled: boolean }[]>`
      SELECT "blindCashEnabled" FROM "Tenant" WHERE "id" = ${tid} LIMIT 1`
    const blindCash = tenantRows[0]?.blindCashEnabled !== false

    // الوضع التقليدي (المفتاح متوقّف): الكاشير بيشوف المتوقع ويأكد —
    // بنجيب رصيد الكاش الورقي لكل فرع ظاهر (نفس حساب الـ POST بالظبط)
    const expectedByBranch = new Map<number, number>()
    // 🔗 (v16) متوقع الوردية المفتوحة — بس للفروع عليها جلسة فتح رسمي
    const sessionExpectedByBranch = new Map<number, number>()
    // الورديات المفتوحة حالياً (واحدة لكل فرع بالتصميم)
    const openRows = await sql<{
      id: number
      branchId: number | null
      shiftName: string
      userName: string | null
      openingFloat: number | null
      createdAt: Date
    }[]>`
      SELECT "id", "branchId", "shiftName", "userName", "openingFloat", "createdAt"
      FROM "ShiftSession"
      WHERE "tenantId" = ${tid} AND "closedAt" IS NULL
      ORDER BY "id" DESC
      LIMIT 40`
    const openByBranch = new Map<number, (typeof openRows)[number]>()
    for (const r of openRows) {
      if (r.branchId != null && !openByBranch.has(r.branchId)) openByBranch.set(r.branchId, r)
    }
    if (!blindCash) {
      for (const b of visible) {
        const bal = await sql<{ expected: number }[]>`
          SELECT COALESCE(SUM("amount"), 0)::float8 AS expected
          FROM "CashEntry"
          WHERE "tenantId" = ${tid}
            AND ("method" = 'cash' OR "method" IS NULL)
            AND ${branchScopeSql(sql, tid, b.id, 'branchId')}`
        expectedByBranch.set(b.id, round2(Number(bal[0]?.expected ?? 0)))
        // 🔗 الوردية المفتوحة؟ متوقعها = عهدة الفتح/آخر إغلاق + حركات الكاش من وقت الفتح
        const os = openByBranch.get(b.id)
        if (os) {
          const net = await sql<{ net: number }[]>`
            SELECT COALESCE(SUM("amount"), 0)::float8 AS net
            FROM "CashEntry"
            WHERE "tenantId" = ${tid}
              AND ("method" = 'cash' OR "method" IS NULL)
              AND "createdAt" >= ${os.createdAt}
              AND ${branchScopeSql(sql, tid, b.id, 'branchId')}`
          const baseline = sessionBaseline({
            openingFloat: os.openingFloat,
            lastClosureCounted: lastByBranch.get(b.id)?.counted ?? null,
          })
          sessionExpectedByBranch.set(b.id, sessionExpected(baseline, Number(net[0]?.net ?? 0)))
        }
      }
    }

    return NextResponse.json({
      blindCash,
      branches: visible.map((b) => {
        const last = lastByBranch.get(b.id) ?? null
        const os = openByBranch.get(b.id) ?? null
        return {
          id: b.id,
          name: b.name,
          isMain: b.isMain,
          shifts: normalizeShifts(b.shifts),
          lastClosure: last
            ? { shiftName: last.shiftName, userName: last.userName, createdAt: last.createdAt }
            : null,
          // 🔗 الوردية المفتوحة دلوقتي (لو فيه) — الدايلوج بيعرضها ويحذّر
          openSession: os
            ? {
                id: os.id,
                shiftName: os.shiftName,
                userName: os.userName,
                openingFloat: os.openingFloat,
                createdAt: new Date(os.createdAt).toISOString(),
              }
            : null,
          // 🫥 الوضع التقليدي بس — في الوضع الأعمي الحقل ده مش موجود أصلاً
          ...(blindCash
            ? {}
            : {
                expectedCash: expectedByBranch.get(b.id) ?? 0,
                // 🔗 متوقع الوردية نفسها (لو مفتوحة) — ده اللي الإغلاق هيقيس عليه
                ...(os ? { sessionExpectedCash: sessionExpectedByBranch.get(b.id) ?? 0 } : {}),
              }),
        }
      }),
    })
  })
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    requireShiftCloseAccess(session)
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  return withSql(async (sql: Sql) => {
    const tid = session.tenantId
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // ── الفرع: موظف الفرع = فرعه إجبارياً. المدير/بدون فرع: branchId من الطلب
    //    أو الفرع الرئيسي (نفس قاعدة الخزنة).
    let branchId = session.branchId ?? null
    if (!branchId) {
      const reqBranch = parseInt(body?.branchId, 10)
      if (Number.isFinite(reqBranch)) branchId = reqBranch
    }
    if (!branchId) {
      const main = await sql<{ id: number }[]>`
        SELECT "id" FROM "Branch" WHERE "tenantId" = ${tid} AND "isMain" = true LIMIT 1`
      branchId = main[0]?.id ?? null
    }
    if (!branchId) {
      return NextResponse.json({ error: 'مفيش فرع مسجّل للمحل' }, { status: 400 })
    }
    const branch = await sql<BranchRow[]>`
      SELECT "id", "name", "isMain", "shifts"
      FROM "Branch" WHERE "id" = ${branchId} AND "tenantId" = ${tid} LIMIT 1`
    if (branch.length === 0) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

    // ── الوردية: لازم تكون من ورديات الفرع المعرفة (منع الأسماء العشوائية)
    const shifts = normalizeShifts(branch[0].shifts)
    if (shifts.length === 0) {
      return NextResponse.json(
        { error: 'الفرع ده مفيش ورديات معرفة — المدير يضيفها من إعدادات الفروع الأول' },
        { status: 400 },
      )
    }
    const shiftName = String(body?.shiftName ?? '').trim().slice(0, 40)
    if (!shifts.some((s: BranchShift) => s.name === shiftName)) {
      return NextResponse.json(
        { error: `اختار وردية من اللي معرفة: ${shifts.map((s: BranchShift) => s.name).join(' / ')}` },
        { status: 400 },
      )
    }

    // ── العدّ: رقم حقيقي ≥ 0 (اللي الكاشير عدّاه في الدرج)
    const counted = Math.round((Number(body?.counted) || NaN) * 100) / 100
    if (!Number.isFinite(counted) || counted < 0 || counted > 999_999_999) {
      return NextResponse.json({ error: 'اكتب المبلغ اللي عدّيته في الدرج' }, { status: 400 })
    }

    const note = body?.note ? String(body.note).trim().slice(0, 200) : null

    // ── 🔗 (v16) الوردية المفتوحة للفرع (لو فيه)؟ الإغلاق بيتحسب على الوردية
    //    نفسها: عهدة الفتح (ألا آخر إغلاق قبلها، ألا صفر) + صافي حركات الكاش
    //    من وقت الفتح. من غير جلسة مفتوحة = نفس السلوك القديم (رصيد الدرج كله).
    const openSession = await sql<{
      id: number
      shiftName: string
      openingFloat: number | null
      createdAt: Date
    }[]>`
      SELECT "id", "shiftName", "openingFloat", "createdAt"
      FROM "ShiftSession"
      WHERE "tenantId" = ${tid}
        AND "closedAt" IS NULL
        AND "branchId" IS NOT DISTINCT FROM ${branchId}
      ORDER BY "id" DESC
      LIMIT 1`

    let expected: number
    let sessionId: number | null = null
    let finalShiftName = shiftName
    if (openSession.length > 0) {
      const s = openSession[0]
      sessionId = s.id
      // اسم الوردية في الإغلاق = اسم جلسة الفتح (وحدة التدقيق هي الجلسة)
      finalShiftName = s.shiftName
      const lastC = await sql<{ counted: number }[]>`
        SELECT "counted" FROM "ShiftClosure"
        WHERE "tenantId" = ${tid}
          AND "branchId" IS NOT DISTINCT FROM ${branchId}
          AND "createdAt" <= ${s.createdAt}
        ORDER BY "id" DESC
        LIMIT 1`
      const baseline = sessionBaseline({
        openingFloat: s.openingFloat,
        lastClosureCounted: lastC[0]?.counted ?? null,
      })
      const netRows = await sql<{ net: number }[]>`
        SELECT COALESCE(SUM("amount"), 0)::float8 AS net
        FROM "CashEntry"
        WHERE "tenantId" = ${tid}
          AND ("method" = 'cash' OR "method" IS NULL)
          AND "createdAt" >= ${s.createdAt}
          AND ${branchScopeSql(sql, tid, branchId, 'branchId')}`
      expected = sessionExpected(baseline, Number(netRows[0]?.net ?? 0))
    } else {
      // ── المتوقع (السلوك القديم): رصيد الكاش الورقي للفرع لحظة الإغلاق
      //    (method='cash' أو NULL)
      const balRows = await sql<{ expected: number }[]>`
        SELECT COALESCE(SUM("amount"), 0)::float8 AS expected
        FROM "CashEntry"
        WHERE "tenantId" = ${tid}
          AND ("method" = 'cash' OR "method" IS NULL)
          AND ${branchScopeSql(sql, tid, branchId, 'branchId')}`
      expected = round2(Number(balRows[0]?.expected ?? 0))
    }
    const variance = round2(counted - expected)

    await sql`
      INSERT INTO "ShiftClosure"
        ("tenantId", "branchId", "sessionId", "shiftName", "userId", "counted", "expected", "variance", "note")
      VALUES
        (${tid}, ${branchId}, ${sessionId}, ${finalShiftName}, ${session.userId}, ${counted}, ${expected}, ${variance}, ${note})`

    // 🔗 قفل الجلسة — سجل المسؤولية الكامل: فتح فلان ← غلق فلان + أرقام الوردية
    if (sessionId != null) {
      const closer = session.userId
        ? await sql<{ name: string }[]>`
            SELECT "name" FROM "User" WHERE "id" = ${session.userId} LIMIT 1`
        : []
      await sql`
        UPDATE "ShiftSession"
        SET "closedAt" = now(),
            "closedById" = ${session.userId ?? null},
            "closedByName" = ${closer[0]?.name ?? null},
            "counted" = ${counted},
            "expected" = ${expected},
            "variance" = ${variance}
        WHERE "id" = ${sessionId} AND "tenantId" = ${tid}`
    }

    // 🛡️ الرد عمداً من غير أي أرقام — الجرد يفضل أعمى. الفارق يشوفه المدير بس.
    return NextResponse.json({ ok: true })
  })
}

export async function GET() {
  return __GET()
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => __POST(...args))
}
