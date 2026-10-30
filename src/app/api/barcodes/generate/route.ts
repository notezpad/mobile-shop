import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { generateEan13 } from '@/lib/barcode'

export const dynamic = 'force-dynamic'

const MAX_COUNT = 200

/**
 * 🏷️ GET /api/barcodes/generate?count=N
 * بيولّد N باركود EAN-13 (بادئة 20) متحقّق إنهم مش مستخدمين:
 *  - منتجات المحل (أي فرع) — أوسع من الفريدية الفعلية عشان نفس الكود مايتكررش بين الفروع بالصدفة
 *  - ألوان/مقاسات منتجات المحل
 *  - وحدات الجملة (على مستوى المحل)
 * ملحوظة: ده مش حجز — الحاجز النهائي هو فحص الحفظ + الـ unique index/trigger في الداتابيز.
 */
async function __GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try {
    await requireModule(session, 'products')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    throw e
  }

  const raw = parseInt(new URL(req.url).searchParams.get('count') ?? '1', 10)
  const count = Math.max(1, Math.min(MAX_COUNT, Number.isFinite(raw) ? raw : 1))

  const result: string[] = []
  // محاولات قليلة تكفي: التصادم احتمالُه ضئيل جداً، والتكرار لحالات الاستثناء فقط
  for (let attempt = 0; attempt < 5 && result.length < count; attempt++) {
    const need = count - result.length
    const candidates = new Set<string>()
    while (candidates.size < need + 10) candidates.add(generateEan13())
    const list = [...candidates]

    const [prods, vars, units] = await Promise.all([
      db.product.findMany({
        where: { tenantId: session.tenantId, barcode: { in: list } },
        select: { barcode: true },
      }),
      db.productVariant.findMany({
        where: { barcode: { in: list }, product: { tenantId: session.tenantId } },
        select: { barcode: true },
      }),
      db.productUnit.findMany({
        where: { barcode: { in: list }, product: { tenantId: session.tenantId } },
        select: { barcode: true },
      }),
    ])
    const taken = new Set<string>()
    for (const r of [...prods, ...vars, ...units]) if (r.barcode) taken.add(r.barcode)
    for (const c of list) {
      if (result.length >= count) break
      if (!taken.has(c)) result.push(c)
    }
  }

  if (result.length < count) {
    return NextResponse.json({ error: 'تعذّر توليد باركود غير مكرر' }, { status: 500 })
  }
  return NextResponse.json({ barcodes: result })
}

export async function GET(req: NextRequest) {
  return withDb(() => __GET(req))
}
