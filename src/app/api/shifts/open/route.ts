import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireShiftOpenAccess, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { round2 } from '@/lib/purchase-return'
import { normalizeShifts, detectShiftNameInTz, type BranchShift } from '@/lib/branch-shifts'
import { getTenantTimezone } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/**
 * 🔗 2026-11-01 (التحديث السادس عشر) — فتح الوردية (جلسة وردية).
 *
 * الفجوة اللي بتحلها: لما يكون فيه كذا كاشير على نفس الدرج، الإغلاق كان
 * بيتحسب على رصيد الدرج الكامل (بيورث عجز الورديات اللي فاتت) ومفيش سجل
 * لمين كان ماسك الدرج من الأول.
 *
 * «فتح وردية» بيسجل ShiftSession: الفرع + الوردية + مين فتح + العهدة
 * الافتتاحية (اختيارية — اللي فتح عدّ الفلوس اللي في الدرج وقت الفتح).
 * وعند الإغلاق، متوقع الوردية بيتحسب على أساس العهدة/آخر إغلاق + حركات
 * الكاش من وقت الفتح — يعني الفارق بيرجع لوردية بعينها وباش آدمين بعينه.
 *
 * GET  → فرع/فروع المستخدم + ورديات كل فرع + الوردية المفتوحة حالياً لكل
 *        فرع (عشان الدايلوج يمنع فتح واحدة والأخرى لسه شغالة). مفيش أي
 *        مبالغ من النظام راجعة — عهدة الفتح بيدخلها اللي فتح بنفسه.
 * POST → { branchId?, shiftName?, openingFloat?, note? } → { ok: true }
 *
 * الصلاحية: requireShiftOpenAccess — مدير، أو موظف من غير قيود، أو موظف
 * عنده 'shift_open'. الفرع: موظف الفرع بيفتح وردية فرعه بس.
 * القاعدة: **وردية مفتوحة واحدة لكل فرع** — الفتح بيرفض لو فيه واحدة شغالة.
 */

interface BranchRow {
  id: number
  name: string
  isMain: boolean
  shifts: unknown
}

interface OpenSessionRow {
  id: number
  branchId: number | null
  shiftName: string
  userName: string | null
  openingFloat: number | null
  createdAt: Date
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
    requireShiftOpenAccess(session)
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  return withSql(async (sql: Sql) => {
    const tid = session.tenantId

    // 🏬 نفس قاعدة قراءة الفروع في الإغلاق بالظبط
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
      visible = [branches[0], ...branches.filter((b) => !b.isMain)]
    }

    // الورديات المفتوحة حالياً (واحدة كحد أقصى لكل فرع بالتصميم — بنقرا 40
    // عشان نغطي أي بيانات قديمة، والخريطة بتاخد أول واحدة لكل فرع)
    const openRows = await sql<OpenSessionRow[]>`
      SELECT "id", "branchId", "shiftName", "userName", "openingFloat", "createdAt"
      FROM "ShiftSession"
      WHERE "tenantId" = ${tid} AND "closedAt" IS NULL
      ORDER BY "id" DESC
      LIMIT 40`
    const openByBranch = new Map<number, OpenSessionRow>()
    for (const r of openRows) {
      if (r.branchId != null && !openByBranch.has(r.branchId)) openByBranch.set(r.branchId, r)
    }

    return NextResponse.json({
      branches: visible.map((b) => {
        const os = openByBranch.get(b.id) ?? null
        return {
          id: b.id,
          name: b.name,
          isMain: b.isMain,
          shifts: normalizeShifts(b.shifts),
          openSession: os
            ? {
                id: os.id,
                shiftName: os.shiftName,
                userName: os.userName,
                openingFloat: os.openingFloat,
                createdAt: new Date(os.createdAt).toISOString(),
              }
            : null,
        }
      }),
    })
  })
}

export async function GET() {
  return __GET()
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => __POST(...args))
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
    requireShiftOpenAccess(session)
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

    // ── الفرع: نفس قاعدة الإغلاق بالظبط (موظف الفرع = فرعه إجبارياً،
    //    المدير/بدون فرع: branchId من الطلب أو الفرع الرئيسي)
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

    // ── الوردية: من ورديات الفرع المعرفة — ولو ماتبعتش بنكشفها من الساعة
    const shifts = normalizeShifts(branch[0].shifts)
    if (shifts.length === 0) {
      return NextResponse.json(
        { error: 'الفرع ده مفيش ورديات معرفة — المدير يضيفها من إعدادات الفروع الأول' },
        { status: 400 },
      )
    }
    const bodyShift = String(body?.shiftName ?? '').trim().slice(0, 40)
    const tz = await getTenantTimezone(tid)
    const shiftName = bodyShift || detectShiftNameInTz(shifts, new Date(), tz) || ''
    if (!shifts.some((s: BranchShift) => s.name === shiftName)) {
      return NextResponse.json(
        { error: `اختار وردية من اللي معرفة: ${shifts.map((s: BranchShift) => s.name).join(' / ')}` },
        { status: 400 },
      )
    }

    // ── العهدة الافتتاحية: اختيارية — رقم ≥ 0 لو موجودة
    let openingFloat: number | null = null
    if (body?.openingFloat !== undefined && body?.openingFloat !== null && body?.openingFloat !== '') {
      // ⚠️ الصفر مقبول (درج فاضي) — مفيش `|| NaN` هنا
      const f = Math.round(Number(body.openingFloat) * 100) / 100
      if (!Number.isFinite(f) || f < 0 || f > 999_999_999) {
        return NextResponse.json({ error: 'العهدة الافتتاحية لازم تكون رقم صحيح' }, { status: 400 })
      }
      openingFloat = round2(f)
    }

    const note = body?.note ? String(body.note).trim().slice(0, 200) || null : null

    // ── القاعدة الذهبية: وردية مفتوحة واحدة لكل فرع — الفتح بيرفض والأخرى شغالة
    //    (IS NOT DISTINCT FROM بيغطي branchId NULL برضه — محلات من غير فروع)
    const openNow = await sql<{ id: number; shiftName: string; userName: string | null; createdAt: Date }[]>`
      SELECT "id", "shiftName", "userName", "createdAt"
      FROM "ShiftSession"
      WHERE "tenantId" = ${tid}
        AND "closedAt" IS NULL
        AND "branchId" IS NOT DISTINCT FROM ${branchId}
      ORDER BY "id" DESC
      LIMIT 1`
    if (openNow.length > 0) {
      const s = openNow[0]
      const when = new Date(s.createdAt).toLocaleString('ar-EG', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz,
      })
      return NextResponse.json(
        {
          error: `فيه وردية مفتوحة بالفعل (${s.shiftName}${s.userName ? ` — فتحها ${s.userName}` : ''} ${when}). اقفلها الأول قبل ما تفتح واحدة جديدة`,
        },
        { status: 409 },
      )
    }

    // ── اسم الفاتح (لقطة للعرض — زي نمط التدقيق في ShiftClosure)
    const me = session.userId
      ? await sql<{ name: string }[]>`
          SELECT "name" FROM "User" WHERE "id" = ${session.userId} LIMIT 1`
      : []

    // ⚛️ إدخال ذري: بيدخل بس لو مفيش وردية مفتوحة على الفرع (والـ unique index
    // الجزئي في الداتابيز خط دفاع تاني ضد الضغطتين المتزامنتين)
    let inserted: { id: number }[] = []
    try {
      inserted = await sql<{ id: number }[]>`
        INSERT INTO "ShiftSession"
          ("tenantId", "branchId", "shiftName", "userId", "userName", "openingFloat", "note")
        SELECT ${tid}, ${branchId}::int, ${shiftName}, ${session.userId ?? null},
               ${me[0]?.name ?? null}, ${openingFloat}::float8, ${note}
        WHERE NOT EXISTS (
          SELECT 1 FROM "ShiftSession"
          WHERE "tenantId" = ${tid} AND "closedAt" IS NULL
            AND "branchId" IS NOT DISTINCT FROM ${branchId}::int
        )
        RETURNING "id"`
    } catch (e: any) {
      if (e?.code !== '23505') throw e
    }
    if (inserted.length === 0) {
      return NextResponse.json(
        { error: 'فيه وردية مفتوحة بالفعل على الفرع ده — اقفلها الأول قبل ما تفتح واحدة جديدة' },
        { status: 409 },
      )
    }

    // الرد عمداً من غير أي أرقام — نفس انضباط الإغلاق الأعمي
    return NextResponse.json({ ok: true })
  })
}
