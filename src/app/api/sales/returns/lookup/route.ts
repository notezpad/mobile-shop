import { NextRequest, NextResponse } from 'next/server'
import { canAccessBranchRecord } from '@/lib/branch-scope-db'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { featureErrorResponse, requireSaleReturnAccess } from '@/lib/features'
import { getSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/**
 * 🔁 2026-10-31 — بحث فاتورة واحدة لغرض المرتجع من نقطة البيع.
 *
 * ليه؟ صلاحية الكاشير «نقطة البيع فقط» بتمنعه من شاشة سجل المبيعات (المبيعات
 * والأرباح بتاع المالك)، لكن العميل بيرجع بالفاتورة — فالكاشير محتاج يلاقي
 * الفاتورة دي نفسها يعمل منها مرتجع. الحل: صلاحية مستقلة `returns` + endpoint
 * بيدوّر على فاتورة *واحدة* برقمها ويرجّع الحد الأدنى من البيانات:
 *
 *   ✅ بيرجع:  رقم الفاتورة، الحالة، المدفوع/المسترد (لازم لسؤال رد الكاش)،
 *              اسم العميل، وأصناف الفاتورة (بالسعر — موجود على الورق أصلاً).
 *   ❌ ميرجعش: التكلفة/الربح (cost مش متجلّب أصلاً)، ولا أي قايمة مبيعات أو
 *              إجماليات، ولا أرصدة عميل — حتى لو صلاحية الكاشير كانت أوسع.
 *
 * الصلاحية: requireSaleReturnAccess — مدير، أو موظف عنده 'sales' أو 'returns'.
 * الفرع: موظف فرع مايشوفش غير فواتير فرعه (نفس قاعدة POST /api/sales/returns).
 *
 * ?q= رقم الفاتورة — بيقبّل:
 *   - الرقم الكامل  «SHOP-2026-00012» (مش حساس لحالة الحروف).
 *   - آخر الجزء     «00012» (اللي مطبوع على ورقة الفاتورة).
 *   - أرقام عربية   «٠٠٠١٢» بتتحوّل تلقائياً.
 *   - رقم الفاتورة الداخلي «12» (fallback).
 */
async function __GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // 🔐 صلاحية المرتجع: 'sales' أو 'returns' (مدير / موظف بدون قيود بيمرّ)
  try { requireSaleReturnAccess(session) } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const raw = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (!raw) {
    return NextResponse.json({ error: 'اكتب رقم الفاتورة الأول' }, { status: 400 })
  }

  // تحويل الأرقام العربية/الفارسية ← لاتينية (كيبورد الموبايل)
  const q = raw.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const ai = AR_DIGITS.indexOf(d)
    if (ai >= 0) return String(ai)
    return String(FA_DIGITS.indexOf(d))
  })

  const sql = getSql()
  type IdRow = { id: number }
  let saleId: number | null = null

  // 1) مطابقة كاملة لرقم الفاتورة (مش حساسة للحالة)
  {
    const rows = await sql<IdRow[]>`
      SELECT "id" FROM "Sale"
       WHERE "tenantId" = ${session.tenantId} AND lower("invoiceNo") = ${q.toLowerCase()}
       ORDER BY "id" DESC
       LIMIT 1`
    saleId = rows[0]?.id ?? null
  }

  // 2) آخر جزء من الرقم «00012» → "-00012"
  if (saleId == null && /^\d{2,}$/.test(q)) {
    const rows = await sql<IdRow[]>`
      SELECT "id" FROM "Sale"
       WHERE "tenantId" = ${session.tenantId} AND right("invoiceNo", ${q.length + 1}) = ${'-' + q}
       ORDER BY "id" DESC
       LIMIT 1`
    saleId = rows[0]?.id ?? null
  }

  // 3) fallback: رقم الفاتورة الداخلي
  if (saleId == null && /^\d+$/.test(q)) {
    const rows = await sql<IdRow[]>`
      SELECT "id" FROM "Sale"
       WHERE "tenantId" = ${session.tenantId} AND "id" = ${Number(q)}
       LIMIT 1`
    saleId = rows[0]?.id ?? null
  }

  if (saleId == null) {
    return NextResponse.json(
      { error: `مفيش فاتورة بالرقم «${raw}» — راجع ورقة الفاتورة وجرّب تاني` },
      { status: 404 },
    )
  }

  const sale = await db.sale.findFirst({
    where: { id: saleId, tenantId: session.tenantId },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      paid: true,
      refunded: true,
      paymentMethod: true,
      customerId: true,
      branchId: true,
      customer: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          productId: true,
          name: true,
          price: true,
          quantity: true,
          returnedQty: true,
          unitLabel: true,
          unitQuantity: true,
          pieceLabel: true,
          variant: { select: { color: true, size: true, condition: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!sale) {
    return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
  }
  // 🏬 موظف الفرع: فواتير فرعه بس (نفس قاعدة POST /api/sales/returns)
  if (!(await canAccessBranchRecord(session.tenantId, sale.branchId, session.branchId))) {
    return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
  }

  // 🔒 الحد الأدنى للبيانات — بدون أي تكلفة أو ربح (مفيش cost هنا أصلاً)
  return NextResponse.json({
    sale: {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      status: sale.status,
      paid: sale.paid,
      refunded: sale.refunded,
      paymentMethod: sale.paymentMethod,
      customerId: sale.customerId,
      customerName: sale.customer?.name ?? null,
      items: sale.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        returnedQty: it.returnedQty,
        unitLabel: it.unitLabel,
        unitQuantity: it.unitQuantity,
        pieceLabel: it.pieceLabel,
        variantLabel:
          [it.variant?.color, it.variant?.size, it.variant?.condition === 'used' ? 'مستعمل' : null].filter(Boolean).join(' / ') || null,
      })),
    },
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
