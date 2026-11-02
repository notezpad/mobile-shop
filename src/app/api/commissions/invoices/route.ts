import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireCommissionsAccess, featureErrorResponse } from '@/lib/features'
import { withSql } from '@/lib/sql'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { isMonthStr, monthRangeUtc, round2 } from '@/lib/seller-commissions'

export const dynamic = 'force-dynamic'

/**
 * 💰 تفاصيل عمولة بائع في شهر — GET /api/commissions/invoices?userId=…&month=YYYY-MM
 *
 * بترجّع الحركات اللي كوّنت رقم العمولة في التقرير (نفس شروط sellersMonthAggregates):
 *  - فواتير الشهر المنسوبة للبائع (مع استبعاد فاتورة «مرتجعة» من مسار الحذف بدون صف مرتجع — ج-3)
 *  - مرتجعات الشهر على فواتير البائع (بتاريخ المرتجع)، صافيها = total − exchangeTotal (مت-4)
 * عمولة كل صف = المبلغ × نسبة الفاتورة الأصلية (اللقطة) — فمجموع الصفوف = عمولة التقرير قبل بوابة التارجت.
 * الصلاحية: نفس صلاحية التقرير.
 */
const LIMIT = 300

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
  const userId = searchParams.get('userId') ?? ''
  const monthParam = searchParams.get('month')
  if (!userId) return NextResponse.json({ error: 'البائع مطلوب' }, { status: 400 })

  return withSql(async (sql) => {
    const tz = await getTenantTimezone(session.tenantId)
    const month = isMonthStr(monthParam) ? monthParam : dateStrInTz(new Date(), tz).slice(0, 7)
    const { gte, lte } = monthRangeUtc(month, tz)

    const [saleRows, returnRows] = await Promise.all([
      sql<{ id: number; invoiceNo: string | null; total: string; rate: number | null; status: string; createdAt: Date }[]>`
        SELECT s."id", s."invoiceNo", s."total", s."commissionRate" AS rate, s."status", s."createdAt"
        FROM "Sale" s
        WHERE s."tenantId" = ${session.tenantId} AND s."sellerId" = ${userId}
          AND s."createdAt" >= ${gte} AND s."createdAt" <= ${lte}
          AND (s."status" <> 'مرتجعة' OR EXISTS (SELECT 1 FROM "SaleReturn" sr WHERE sr."saleId" = s."id"))
        ORDER BY s."createdAt" DESC
        LIMIT ${LIMIT + 1}`,
      sql<{ id: number; saleId: number; invoiceNo: string | null; net: string; rate: number | null; createdAt: Date; saleAt: Date }[]>`
        SELECT r."id", r."saleId", s."invoiceNo", (r."total" - r."exchangeTotal") AS net,
               s."commissionRate" AS rate, r."createdAt", s."createdAt" AS "saleAt"
        FROM "SaleReturn" r
        JOIN "Sale" s ON s."id" = r."saleId"
        WHERE r."tenantId" = ${session.tenantId} AND s."sellerId" = ${userId}
          AND r."createdAt" >= ${gte} AND r."createdAt" <= ${lte}
        ORDER BY r."createdAt" DESC
        LIMIT ${LIMIT + 1}`,
    ])

    const rows = [
      ...saleRows.slice(0, LIMIT).map((r) => {
        const amount = round2(Number(r.total) || 0)
        return {
          kind: 'sale' as const,
          id: r.id,
          invoiceNo: r.invoiceNo ?? null,
          at: r.createdAt,
          amount,
          commission: round2((amount * (Number(r.rate) || 0)) / 100),
          status: r.status,
        }
      }),
      ...returnRows.slice(0, LIMIT).map((r) => {
        const amount = round2(Number(r.net) || 0)
        return {
          kind: 'return' as const,
          id: r.id,
          invoiceNo: r.invoiceNo ?? null,
          at: r.createdAt,
          amount,
          commission: round2((-amount * (Number(r.rate) || 0)) / 100),
          status: 'مرتجع',
          // 🔎 الفاتورة الأصلية: المرتجع بيتخصم في شهره، فلو الفاتورة من شهر أقدم نوضّح ده للقارئ
          saleAt: r.saleAt,
          fromPrevMonth: new Date(r.saleAt).getTime() < gte.getTime(),
        }
      }),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    return NextResponse.json(
      { month, userId, rows, truncated: saleRows.length > LIMIT || returnRows.length > LIMIT },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
