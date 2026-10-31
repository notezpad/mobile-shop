import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * 🫥 2026-10-31 (التحديث الحادي عشر) — تقرير تغطية العدّ (للمدير فقط).
 *
 * أهم فحص مضاد للغش في الجرد الأعمي: العدّاد ممكن يغشّ ويعدّ بس الأصناف
 * اللي واثق منها ويسيب الباقي. التقرير ده بيقول للمدير:
 *   «عدّيت 120 من 850 صنف» + قايمة الأصناف اللي **ما اتعدّتش** (اسم + باركود).
 *
 * نطاق التغطية = نفس منطق محطة الجرد: منتجات الفرع + غير المسندة
 * (branchId = ورقة الجرد أو NULL). التغطية على مستوى الصنف (المنتج الواحد
 * ممكن يكون ليه أسطر ألوان/مقاسات متعددة — كفاية إنه اتعُدّ مرة).
 * للأدمن فقط — الموظف ميعرفش اللي ما اتعدّش.
 */

async function __GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try {
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await ctx.params
  const sid = parseInt(id, 10)
  const st = await db.stocktake.findUnique({
    where: { id: sid },
    select: { id: true, tenantId: true, branchId: true, mode: true, status: true, items: { select: { productId: true } } },
  })
  if (!st || st.tenantId !== s.tenantId) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }

  // نطاق الورقة: نفس فلتر المحطة — فرع الورقة + غير المسندة
  const scopeWhere = {
    tenantId: s.tenantId,
    OR: st.branchId != null ? [{ branchId: st.branchId }, { branchId: null }] : undefined,
  }
  const [total, countedIds] = await Promise.all([
    db.product.count({ where: scopeWhere }),
    Promise.resolve(
      new Set(st.items.map((i) => i.productId).filter((x): x is number => x != null)).size,
    ),
  ])
  const countedSet = new Set(st.items.map((i) => i.productId).filter((x): x is number => x != null))

  const missingRows = await db.product.findMany({
    where: { ...scopeWhere, id: { notIn: [...countedSet] } },
    select: { id: true, name: true, barcode: true },
    orderBy: { name: 'asc' },
    take: 500,
  })

  return NextResponse.json({
    total,
    counted: countedIds,
    missing: missingRows,
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
