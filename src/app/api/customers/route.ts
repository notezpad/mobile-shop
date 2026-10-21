import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql } from '@/lib/sql'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET بقى SQL مباشر عبر postgres.js —
 * كان بيشغّل استعلامين Prisma (قائمة + groupBy على كل المبيعات) + إنشاء
 * PrismaClient في كل طلب، وكان من أوضح اللي بتقع معاه "Exceeded CPU Limit"
 * في wrangler tail. نفس الرد بنفس الشكل بالظبط ( bare array أو {data,...}
 * مع _count.sales وtotalPurchases وlastSaleAt).
 *
 * 🛡️ 2026-09-27: SAFETY_CAP بيوازن "كل العملاء" المطلوب للأوفلاين/الإكسل
 * مع عدم فتح باب مسح غير محدود.
 *
 * 🛡️ 2026-09-30 (C6/M12): الفواتير المرتجعة بالكامل ماتتحسبش مشتريات
 * (status <> 'مرتجعة') — نفس الشرط في SQL.
 */
const SAFETY_CAP = 3000

export async function GET(req: NextRequest) {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-mowazaf: module 'customers'
    try { requireModule(session, 'customers') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''

    // ⚡ EDGE CACHE (2026-10-06) — نفس مفاتيح الكاش القديمة بدون تغيير
    const cacheable = !search && !searchParams.has('page') && searchParams.keys().next().done === true
    if (cacheable) {
      const cached = await matchEdgeCache('/api/customers', '', session.tenantId, 2)
      if (cached) return cached
    }

    const paginated = searchParams.has('page')
    const limit = paginated
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      : SAFETY_CAP
    const page = paginated ? Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)) : 1
    const skip = paginated ? (page - 1) * limit : 0

    // ملاحظة: بحث Prisma القديم كان contains **حساس لحالة الحروف** (بدون
    // mode:'insensitive') — LIKE في Postgres بنفس السلوك حرفيًا.
    const searchPattern = search ? `%${search}%` : null

    const rows = await sql<any[]>`
      SELECT c.*,
             (SELECT COUNT(*)::int FROM "Sale" s WHERE s."customerId" = c."id") AS "__salesCount"
      FROM "Customer" c
      WHERE c."tenantId" = ${session.tenantId}
        ${searchPattern ? sql`AND (c."name" LIKE ${searchPattern} OR c."phone" LIKE ${searchPattern})` : sql``}
      ORDER BY c."id" DESC
      LIMIT ${limit} OFFSET ${skip}`

    // إجمالي عدد العملاء (paginated فقط — زي القديم بالظبط)
    let total: number | null = null
    if (paginated) {
      const cnt = await sql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt FROM "Customer"
        WHERE "tenantId" = ${session.tenantId}
          ${searchPattern ? sql`AND ("name" LIKE ${searchPattern} OR "phone" LIKE ${searchPattern})` : sql``}`
      total = Number(cnt[0]?.cnt ?? 0)
    }

    // 🛡️ C6/M12: تجميع المشتريات + آخر فاتورة لكل عميل (بدون المرتجعة)
    type AggRow = { customerId: number; total: number; lastSaleAt: Date | null }
    const salesAgg = await sql<AggRow[]>`
      SELECT "customerId",
             COALESCE(SUM("total"), 0)::float8 AS total,
             MAX("createdAt") AS "lastSaleAt"
      FROM "Sale"
      WHERE "tenantId" = ${session.tenantId}
        AND "customerId" IS NOT NULL
        AND "status" <> 'مرتجعة'
      GROUP BY "customerId"`
    const aggByCustomer = new Map<number, { totalPurchases: number; lastSaleAt: Date | null }>(
      salesAgg.map((a) => [Number(a.customerId), { totalPurchases: a.total ?? 0, lastSaleAt: a.lastSaleAt }])
    )

    const result = rows.map((c) => {
      const { __salesCount, ...rest } = c
      return {
        ...rest,
        _count: { sales: Number(__salesCount ?? 0) },
        totalPurchases: aggByCustomer.get(Number(c.id))?.totalPurchases ?? 0,
        lastSaleAt: aggByCustomer.get(Number(c.id))?.lastSaleAt ?? null,
      }
    })

    if (!paginated) {
      const res = NextResponse.json(result)
      if (cacheable) {
        // ⚡ خزّن نسخة على الحافة (clone — الرد الأصلي يكمل للمتصفح)
        await putEdgeCache(res.clone(), '/api/customers', '', session.tenantId, 20, 2)
      }
      return res
    }
    return NextResponse.json({
      data: result,
      total: total ?? result.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((total ?? result.length) / limit)),
    })
  })
}

export async function POST(req: NextRequest) {
  // 🛡️ 2026-10-22 (مراجعة): withIdempotency — نفس نمط /api/cash؛ الواجهة
  // الأوفلاين بتبعت Idempotency-Key مع كل كتابة، وإعادة الإرسال بعد انقطاع
  // بترجّع الرد الأصلي بدل عميل مكرّر بنفس الرصيد الافتتاحي (دين مضاعف).
  return withIdempotency(req, () => withDb(() => __POST(req)))
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // saleh-kateb-mowazaf: module 'customers'
  try { requireModuleWritePermission(session, 'customers') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  }

  // 🆕 2026-10-22: رصيد افتتاحي — التاجر اللي بينقل من نظام قديم/دفتر يدخل
  // دين العميل القديم كأول قيد موثّق في كشف حسابه. حركة دفاتر محضة
  // (BalanceEntry) — مفيش CashEntry لأن الدين القديم مش نقدية.
  // 🛠️ 2026-10-22 (مراجعة): الافتتاحي بقى أدمن فقط (نفس قاعدة التسوية
  // بعد الإنشاء) — قبل كده أي موظف عنده صلاحية كتابة كان يقدر يفتح
  // حساب عميل بأي دين حتى ±999,999,999 بدون أثر في AuditLog.
  let openingBalance = 0
  if (body.openingBalance !== undefined && body.openingBalance !== null && String(body.openingBalance).trim() !== '') {
    openingBalance = Number(body.openingBalance)
    if (!Number.isFinite(openingBalance)) {
      return NextResponse.json({ error: 'الرصيد الافتتاحي غير صالح' }, { status: 400 })
    }
    openingBalance = Math.round((openingBalance + Number.EPSILON) * 100) / 100
    if (Math.abs(openingBalance) > 999999999) {
      return NextResponse.json({ error: 'الرصيد الافتتاحي خارج النطاق المسموح' }, { status: 400 })
    }
    if (Math.abs(openingBalance) >= 0.005 && session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'الرصيد الافتتاحي للأدمن فقط — اطلب من مدير المحل إدخاله أو سجّل العميل بدون رصيد' },
        { status: 403 },
      )
    }
  }
  const openingNote =
    body.openingBalanceNote ? String(body.openingBalanceNote).trim().slice(0, 300) : ''

  let created
  if (Math.abs(openingBalance) < 0.005) {
    created = await db.customer.create({
      data: {
        tenantId: session.tenantId,
        name: String(body.name).trim(),
        phone: body.phone ? String(body.phone).trim() : null,
      },
    })
  } else {
    // معاملة واحدة: العميل + قيد الافتتاح + سطر تدقيق + ضبط الرصيد — إما الكل أو ولا حاجة
    created = await db.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          tenantId: session.tenantId,
          name: String(body.name).trim(),
          phone: body.phone ? String(body.phone).trim() : null,
        },
      })
      const reason = openingNote || 'رصيد افتتاحي — ترحيل من النظام القديم'
      const entry = await tx.balanceEntry.create({
        data: {
          tenantId: session.tenantId,
          kind: 'customer',
          refId: c.id,
          delta: openingBalance,
          reason,
          createdBy: session.name || session.email || null,
        },
      })
      // 🛠️ تدقيق ذري (fatal) — الافتتاحي حركة مالية مش بتنعمل بدون أثر
      await logAudit(
        {
          action: 'balance.opening',
          targetType: 'customer',
          targetId: String(c.id),
          details: {
            tenantId: session.tenantId,
            entryId: entry.id,
            delta: openingBalance,
            before: 0,
            after: openingBalance,
            reason,
          },
          actor: { id: String(session.userId ?? ''), email: session.email },
        },
        undefined,
        { tx, fatal: true },
      )
      return tx.customer.update({ where: { id: c.id }, data: { balance: openingBalance } })
    })
  }
  // ⚡ تفريغ الكاش فوراً — العميل الجديد يظهر في كل القوائم لحظياً
  await purgeEdgeCache(
    [PURGE_KEYS.customersDefault, PURGE_KEYS.dashboard(7), PURGE_KEYS.dashboard(14), PURGE_KEYS.dashboard(30)],
    session.tenantId,
    2
  )
  return NextResponse.json(created, { status: 201 })
}
