import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { REFUND_METHODS } from '@/lib/purchase-return'
import { getTenantTimezone, dateStrInTz } from '@/lib/tenantTime'
import { withSql, isUniqueViolation } from '@/lib/sql'
import { getMainBranchIdSql } from '@/lib/branch-scope'
import { purgeCatalogCaches } from '@/lib/edgeCache'
import {
  parseSplitItems,
  splitPaid,
  round2,
  loadSrcProducts,
  loadSrcVariants,
  findDestProduct,
  findDestVariant,
  ensureDestProduct,
  ensureDestVariant,
  checkDestCompat,
  variantLabel,
} from '@/lib/purchase-split'

export const dynamic = 'force-dynamic'

/**
 * 🏬 POST /api/purchase-orders/split — شراء موزّع على فروع (للمدير فقط).
 *
 * body: {
 *   preview?: boolean,            // true = معاينة بدون حفظ
 *   supplierId?, paid?, paymentMethod?,
 *   items: [{ productId, cost, allocations: [{ branchId, quantity }] }]
 * }
 *
 * بيعمل أمر شراء لكل فرع عن طريق نفس دالة create_purchase_order (من غير ما نعدّل عليها)،
 * كله في transaction واحدة: يا كل الفروع يا ولا فرع. كل فرع بيدفع نصيبه (بنسبة إجمالي أمره).
 * مسار منفصل تماماً عن POST /api/purchase-orders — الشراء العادي ما بيتأثرش.
 */
async function __POST(req: NextRequest) {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  if (session.branchId) {
    return NextResponse.json({ error: 'توزيع الشراء على الفروع للمدير فقط' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  const preview = body.preview === true

  const parsed = parseSplitItems(body.items)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const items = parsed.items

  const paidRaw = body.paid === undefined || body.paid === null || body.paid === '' ? 0 : Number(body.paid)
  if (!Number.isFinite(paidRaw) || paidRaw < 0) {
    return NextResponse.json({ error: 'المبلغ المدفوع غير صالح' }, { status: 400 })
  }
  const paid = round2(paidRaw)
  const paymentMethod =
    body.paymentMethod === undefined || body.paymentMethod === null || body.paymentMethod === ''
      ? 'cash'
      : String(body.paymentMethod)
  if (!REFUND_METHODS.has(paymentMethod)) {
    return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 })
  }
  const supplierId = body.supplierId ? parseInt(String(body.supplierId), 10) || null : null

  return withSql(async (sql) => {
    const tid = session.tenantId
    const mainBranchId = await getMainBranchIdSql(sql, tid)
    if (mainBranchId === null) {
      return NextResponse.json({ error: 'مفيش فروع في المحل — استخدم الشراء العادي' }, { status: 400 })
    }

    // الفروع المطلوبة لازم تكون تابعة للمحل
    const branchIds = Array.from(new Set(items.flatMap((i) => i.allocations.map((a) => a.branchId))))
    const branchRows = await sql<{ id: number; name: string }[]>`
      SELECT "id", "name" FROM "Branch" WHERE "tenantId" = ${tid} AND "id" IN ${sql(branchIds)}`
    if (branchRows.length !== branchIds.length) {
      return NextResponse.json({ error: 'فرع غير صالح' }, { status: 400 })
    }
    const branchName = new Map(branchRows.map((b) => [b.id, b.name]))

    // المنتجات المصدر
    const srcRows = await loadSrcProducts(sql, tid, items.map((i) => i.productId))
    const srcMap = new Map(srcRows.map((p) => [p.id, p]))
    for (const it of items) {
      if (!srcMap.has(it.productId)) {
        return NextResponse.json({ error: 'منتج غير موجود في السلة' }, { status: 400 })
      }
    }
    // 🎨 الألوان/المقاسات: منتج له variants لازم كل بند يحدد اللون/المقاس، والعكس ممنوع
    const srcVariants = await loadSrcVariants(sql, items.map((i) => i.productId))
    const variantMap = new Map(srcVariants.map((v) => [v.id, v]))
    for (const it of items) {
      const own = srcVariants.filter((v) => v.productId === it.productId)
      const nm = srcMap.get(it.productId)!.name
      if (own.length > 0) {
        if (it.variantId == null) {
          return NextResponse.json({ error: `المنتج "${nm}" له ألوان ومقاسات — حدّد اللون والمقاس لكل كمية` }, { status: 400 })
        }
        if (!own.some((v) => v.id === it.variantId)) {
          return NextResponse.json({ error: `اللون/المقاس غير تابع للمنتج "${nm}"` }, { status: 400 })
        }
      } else if (it.variantId != null) {
        return NextResponse.json({ error: `المنتج "${nm}" ليس له ألوان أو مقاسات` }, { status: 400 })
      }
    }

    // التجميع: فرع → بنوده
    const order = branchIds.slice().sort((a, b) => (a === mainBranchId ? -1 : b === mainBranchId ? 1 : a - b))
    const perBranch = order.map((branchId) => {
      const lines = items
        .map((it) => {
          const a = it.allocations.find((x) => x.branchId === branchId)
          return a
            ? {
                src: srcMap.get(it.productId)!,
                variant: it.variantId != null ? variantMap.get(it.variantId)! : null,
                cost: it.cost,
                quantity: a.quantity,
              }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      const total = round2(lines.reduce((s, l) => s + l.cost * l.quantity, 0))
      return { branchId, lines, total }
    })
    const grandTotal = round2(perBranch.reduce((s, b) => s + b.total, 0))

    if (paid < grandTotal && !supplierId) {
      return NextResponse.json({ error: 'الشراء بالآجل لازم يكون مرتبط بمورد' }, { status: 400 })
    }
    if (paid > grandTotal && !supplierId) {
      return NextResponse.json(
        { error: 'المدفوع أكبر من إجمالي الفاتورة، اختر مورداً ليُسجَّل الفرق كرصيد دائن لك عنده' },
        { status: 400 },
      )
    }
    if (supplierId) {
      const sup = await sql<{ tenantId: string }[]>`SELECT "tenantId" FROM "Supplier" WHERE "id" = ${supplierId} LIMIT 1`
      if (!sup[0] || sup[0].tenantId !== tid) {
        return NextResponse.json({ error: 'المورد غير صالح' }, { status: 400 })
      }
    }
    const paidParts = splitPaid(perBranch.map((b) => b.total), paid)

    // توافق منتجات الوجهة مع نوع الصنف (قبل أي كتابة)
    for (const b of perBranch) {
      for (const l of b.lines) {
        const dest = await findDestProduct(sql, tid, l.src, mainBranchId, b.branchId)
        if (!dest) continue
        const err = await checkDestCompat(sql, dest.id, l.variant !== null, l.src.name, branchName.get(b.branchId) ?? '')
        if (err) return NextResponse.json({ error: err }, { status: 400 })
      }
    }

    // ── معاينة ──
    if (preview) {
      const out = []
      for (let i = 0; i < perBranch.length; i++) {
        const b = perBranch[i]
        const lines = []
        for (const l of b.lines) {
          const dest = await findDestProduct(sql, tid, l.src, mainBranchId, b.branchId)
          const destVariant = dest && l.variant ? await findDestVariant(sql, dest.id, l.variant) : null
          lines.push({
            productId: l.src.id,
            name: l.variant ? `${l.src.name} — ${variantLabel(l.variant)}` : l.src.name,
            quantity: l.quantity,
            cost: l.cost,
            destProductId: dest?.id ?? null,
            destName: dest?.name ?? null,
            willCreate: !dest,
            willCreateVariant: !!l.variant && !destVariant,
          })
        }
        out.push({
          branchId: b.branchId,
          branchName: branchName.get(b.branchId) ?? '',
          total: b.total,
          paid: paidParts[i],
          lines,
        })
      }
      return NextResponse.json({ preview: true, total: grandTotal, paid, branches: out })
    }

    // ── التنفيذ ──
    const tz = await getTenantTimezone(tid)
    const year = parseInt(dateStrInTz(new Date(), tz).slice(0, 4), 10)
    const groupId = crypto.randomUUID()

    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const orders = await sql.begin(async (tx) => {
          const created: any[] = []
          for (let i = 0; i < perBranch.length; i++) {
            const b = perBranch[i]
            const itemsData = []
            for (const l of b.lines) {
              const destId = await ensureDestProduct(tx, tid, l.src, mainBranchId, b.branchId)
              const destVariantId = l.variant
                ? await ensureDestVariant(tx, tid, b.branchId, destId, l.variant)
                : null
              itemsData.push({
                productId: destId,
                variantId: destVariantId,
                name: l.variant ? `${l.src.name} — ${variantLabel(l.variant)}` : l.src.name,
                cost: l.cost,
                quantity: l.quantity,
              })
            }
            const payload = {
              tenantId: tid,
              branchId: b.branchId,
              userId: session.userId,
              supplierId,
              total: b.total,
              paid: paidParts[i],
              paymentMethod,
              year,
              items: itemsData,
            }
            const rows = await tx<{ result: any }[]>`
              SELECT create_purchase_order(${tx.json(payload)}::jsonb) AS result`
            const res = rows[0]?.result
            await tx`UPDATE "PurchaseOrder" SET "splitGroupId" = ${groupId} WHERE "id" = ${res.id}`
            created.push({ ...res, splitGroupId: groupId })
          }
          return created
        })
        try { await purgeCatalogCaches(tid, null, '3', branchIds) } catch { /* الكاش اختياري */ }
        return NextResponse.json({ splitGroupId: groupId, total: grandTotal, orders }, { status: 201 })
      } catch (e: any) {
        if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue
        const msg = String(e?.message ?? '')
        if (msg.includes('PRODUCT_HAS_VARIANTS')) {
          return NextResponse.json(
            { error: 'منتج في أحد الفروع له ألوان ومقاسات — اشتريه على الفرع ده لوحده' },
            { status: 400 },
          )
        }
        throw e
      }
    }
    return NextResponse.json({ error: 'تعذّر الحفظ، حاول تاني' }, { status: 409 })
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  const req = args[0] as NextRequest
  // المعاينة ما بتتسجلش في الـ idempotency (مفيش كتابة)
  const peek = await req.clone().json().catch(() => null)
  if (peek?.preview === true) return __POST(...args)
  return withIdempotency(req, () => __POST(...args))
}
