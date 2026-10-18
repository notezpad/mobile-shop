import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * 🔎 2026-10-18 — GET /api/inventory/variant-lookup?code=...&branchId=...
 * مسح باركود لون/مقاس (في الجرد مثلاً): بيرجّع المنتج + المقاس المطابق في
 * نطاق المحل (والفرع لو اتحدد: فرعه أو المشترك). بنفس منطق الفريدية الجديد:
 * الباركود فريد جوه الفرع، فمفيش لبس بين الفروع.
 */
async function __GET(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const sp = new URL(req.url).searchParams
  const code = (sp.get('code') ?? '').trim()
  if (!code) return NextResponse.json({ error: 'الباركود مطلوب' }, { status: 400 })
  const wanted = s.branchId ?? (sp.get('branchId') ? parseInt(sp.get('branchId')!, 10) : null)

  const v = await db.productVariant.findFirst({
    where: {
      barcode: code,
      product: {
        tenantId: s.tenantId,
        ...(wanted ? { OR: [{ branchId: wanted }, { branchId: null }] } : {}),
      },
    },
    include: { product: { select: { id: true, name: true, barcode: true, branchId: true, soldByWeight: true } } },
  })
  if (!v) return NextResponse.json({ found: false })
  return NextResponse.json({
    found: true,
    product: v.product,
    variant: { id: v.id, size: v.size, color: v.color, barcode: v.barcode, quantity: v.quantity },
  })
}

export async function GET(req: NextRequest) {
  return withDb(() => __GET(req))
}
