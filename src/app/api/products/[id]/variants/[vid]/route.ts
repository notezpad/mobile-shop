import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, requireModuleWritePermission } from '@/lib/features'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

export const dynamic = 'force-dynamic'

async function loadOwned(tenantId: string, pid: number, vid: number) {
  const v = await db.productVariant.findUnique({ where: { id: vid } })
  if (!v || v.productId !== pid) return null
  const p = await db.product.findUnique({ where: { id: pid } })
  if (!p || p.tenantId !== tenantId) return null
  return v
}

async function __PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (body.size !== undefined) data.size = body.size ? String(body.size).trim() : null
  if (body.color !== undefined) data.color = body.color ? String(body.color).trim() : null
  if (body.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode).trim() : null
  if (body.quantity !== undefined) data.quantity = parseInt(body.quantity, 10) || 0

  if (data.barcode) {
    // 🏬 2026-10-18: باركود المقاس فريد جوه نفس (المحل + الفرع) — فحص برسالة واضحة
    // (الـ trigger في الداتابيز هو الحاجز الأخير)
    const prod = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
    const taken = await db.productVariant.findFirst({
      where: {
        barcode: data.barcode,
        id: { not: vId },
        product: { tenantId: session.tenantId, branchId: prod?.branchId ?? null },
      },
      select: { id: true },
    })
    if (taken) return NextResponse.json({ error: 'الباركود مستخدم' }, { status: 400 })
  }
  try {
    const updated = await db.productVariant.update({ where: { id: vId }, data })
    if (data.quantity !== undefined) {
      await syncProductQuantityFromVariants(db, pid)
      // 📒 2026-10-18: تعديل كمية لون/مقاس مباشرة يتسجل في سجل الحركات (كان بيتغير من غير أثر)
      const delta = data.quantity - owned.quantity
      if (delta !== 0) {
        const prodRow = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
        await db.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            branchId: prodRow?.branchId ?? null,
            productId: pid,
            variantId: vId,
            type: delta > 0 ? 'in' : 'out',
            quantity: delta,
            refType: 'manual',
            note: `تعديل كمية — ${[updated.color, updated.size].filter(Boolean).join(' / ')}`,
            userId: session.userId,
          },
        })
      }
    }
    return NextResponse.json(updated)
  } catch (e: any) {
    if (e?.code === 'P2002' || String(e?.message ?? '').includes('نفس الفرع')) {
      return NextResponse.json({ error: 'الباركود مستخدم' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  }
}

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  await db.productVariant.delete({ where: { id: vId } })
  await syncProductQuantityFromVariants(db, pid)
  // 📒 2026-10-18: حذف لون/مقاس بمخزون = خروج كمية — يتسجل في سجل الحركات
  if (owned.quantity > 0) {
    const prodRow = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
    await db.stockMovement.create({
      data: {
        tenantId: session.tenantId,
        branchId: prodRow?.branchId ?? null,
        productId: pid,
        variantId: null, // الـ variant اتمسح
        type: 'out',
        quantity: -owned.quantity,
        refType: 'manual',
        note: `حذف لون/مقاس — ${[owned.color, owned.size].filter(Boolean).join(' / ')}`,
        userId: session.userId,
      },
    })
  }
  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
