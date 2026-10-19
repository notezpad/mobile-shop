import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30 (M10): تقرير أعمار الديون (Aging Report) — أول أداة ائتمان
 * حقيقية للبيع الآجل في النظام.
 *
 * لكل عميل عليه مديونية، بيتجمع المتبقي من كل فاتورة آجلة (غير مرتجعة) وتتحط
 * في bucket حسب عمر الفاتورة من تاريخ إنشائها (بتوقيت المحل):
 *   current  = لسه في مدتها (٠-٣٠ يوم)
 *   d31_60   = متأخرة ٣١-٦٠ يوم
 *   d61_90   = متأخرة ٦١-٩٠ يوم
 *   d90plus  = متأخرة أكتر من ٩٠ يوم
 *
 * المتبقي لكل فاتورة = max(0, total − paid) — الـ paid بيشمل دفعات وقت البيع
 * والدفعات المرتبطة، والمرتجعات الجزئية بتنعكس في refunded.
 */
export async function GET() {
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

  return withDb(async () => {
    const tz = await getTenantTimezone(session.tenantId)
    const todayStr = dateStrInTz(new Date(), tz)
    const today = new Date(`${todayStr}T00:00:00.000Z`)

    const customers = await db.customer.findMany({
      where: { tenantId: session.tenantId, balance: { gt: 0.005 } },
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
        creditLimit: true,
        sales: {
          where: { status: { not: 'مرتجعة' }, total: { gt: 0 } },
          select: { id: true, invoiceNo: true, total: true, paid: true, refunded: true, dueDate: true, createdAt: true },
        },
      },
      orderBy: { balance: 'desc' },
    })

    const DAY_MS = 24 * 60 * 60 * 1000
    const rows = customers
      .map((c) => {
        const buckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
        let overdue = 0
        for (const s of c.sales) {
          const remaining = Math.max(0, s.total - s.paid)
          if (remaining <= 0.005) continue
          const refDate = s.dueDate ?? s.createdAt // تاريخ الاستحقاق لو متحدد، وإلا تاريخ البيع
          const ageDays = Math.floor((today.getTime() - new Date(refDate).getTime()) / DAY_MS)
          if (ageDays <= 30) buckets.current += remaining
          else if (ageDays <= 60) buckets.d31_60 += remaining
          else if (ageDays <= 90) buckets.d61_90 += remaining
          else buckets.d90plus += remaining
          // متأخرة = عدّت 30 يوم من الاستحقاق/البيع ومفيش سداد كامل
          if (ageDays > 30) overdue += remaining
        }
        const total = buckets.current + buckets.d31_60 + buckets.d61_90 + buckets.d90plus
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          balance: c.balance,
          creditLimit: c.creditLimit,
          overLimit: c.creditLimit != null && c.balance > c.creditLimit + 0.005,
          overdue,
          ...buckets,
          total,
        }
      })
      .filter((r) => r.total > 0.005 || r.overLimit)

    const totals = rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        d31_60: acc.d31_60 + r.d31_60,
        d61_90: acc.d61_90 + r.d61_90,
        d90plus: acc.d90plus + r.d90plus,
        overdue: acc.overdue + r.overdue,
        total: acc.total + r.total,
      }),
      { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, overdue: 0, total: 0 },
    )

    return NextResponse.json({ rows, totals, asOf: todayStr })
  })
}
