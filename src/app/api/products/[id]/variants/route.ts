import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, requireModule, requireModuleWritePermission } from '@/lib/features'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 4): GET بقى SQL مباشر عبر postgres.js —
 * ده أثقل مسار متبقي في التطبيق (218-225ms CPU في قياسات Workers Logs قبل
 * الإصلاح) لأنه كان بيحمّل محرك Prisma wasm كامل في كل طلب لجلب قايمة
 * متغيرات المنتج (مقاسات/ألوان) اللي الـ POS بيطلبها مع كل فتح منتج.
 *
 * نفس الاستجابة حرفيًا:
 *   - نفس الأعمدة ونفس ترتيبها (id, productId, size, color, barcode,
 *     quantity, createdAt) — Prisma كان بيرجّع كل أعمدة الجدول بترتيب
 *     تعريف الـ schema، ونفس ده اللي بيطلع من SELECT صريح بنفس الترتيب.
 *   - نفس سلوك 404: المنتج مش موجود أو مش تابع للمحل → «المنتج غير موجود».
 *   - نفس الترتيب ORDER BY "id" ASC.
 *   - createdAt بيتفك بنفس طريقة Prisma (UTC) عن طريق types بتاعة sql.ts.
 *
 * POST فضل Prisma (عملية نادرة — إضافة متغير جديد) زي ما هو.
 */

async function loadTenantProduct(tenantId: string, productId: number) {
  const p = await db.product.findUnique({ where: { id: productId } })
  if (!p || p.tenantId !== tenantId) return null
  return p
}

type VariantRow = {
  id: number
  productId: number
  size: string | null
  color: string | null
  barcode: string | null
  quantity: number
  displayQty: number
  createdAt: Date
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-mowazaf: module 'products'
    try { await requireModule(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }
    const { id } = await params
    const pid = parseInt(id, 10)
    if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

    // نفس فحص loadTenantProduct القديم: المنتج موجود ومتابع لنفس المحل؟
    // (مش موجود أو تابع لمحل تاني → الحالتين كانوا 404 زي ما هما كده)
    const prod = await sql<{ id: number }[]>`
      SELECT "id" FROM "Product"
      WHERE "id" = ${pid} AND "tenantId" = ${session.tenantId}
      LIMIT 1`
    if (!prod[0]) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

    const variants = await sql<VariantRow[]>`
      SELECT "id", "productId", "size", "color", "barcode", "quantity", "displayQty", "createdAt"
      FROM "ProductVariant"
      WHERE "productId" = ${pid}
      ORDER BY "id" ASC`
    return NextResponse.json(variants)
  })
}

async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const size = body?.size ? String(body.size).trim() || null : null
  const color = body?.color ? String(body.color).trim() || null : null
  const barcode = body?.barcode ? String(body.barcode).trim() || null : null
  const quantity = parseInt(body?.quantity ?? 0, 10) || 0
  if (!size && !color) {
    return NextResponse.json({ error: 'لازم مقاس أو لون على الأقل' }, { status: 400 })
  }
  // 🛡️ 2026-10-19: أول مقاس/لون على منتج عليه رصيد قديم «من غير مقاس» — الرصيد
  // القديم ده هيتمسح بصمت عند أول مزامنة (كمية المنتج بتتحسب = مجموع المقاسات).
  // نفس خسارة الـ 100 قطعة اللي حصلت في أوامر الشراء قبل إصلاح 2026-10-18.
  // بنرفض ونوجّه المستخدم يتعامل مع الرصيد القديم بوعي (حركة صرف أو جرد).
  if (Math.abs(prod.quantity) > 1e-9) {
    const existingVariants = await db.productVariant.count({ where: { productId: pid } })
    if (existingVariants === 0) {
      return NextResponse.json(
        {
          error: `المنتج ده عليه رصيد قديم (${prod.quantity}) من غير مقاس — أي رصيد من غير مقاس هيتمسح أول ما تقسّم على ألوان ومقاسات. اعمل «حركة مخزون ← صرف» للرصيد القديم الأول (أو جرد)، وبعدها ضيف الألوان والمقاسات`
        },
        { status: 400 },
      )
    }
  }
  if (barcode) {
    // 🏬 2026-10-18: باركود المقاس فريد جوه نفس (المحل + الفرع) — الفحص هنا برسالة واضحة،
    // والـ trigger في الداتابيز هو الحاجز الأخير
    const taken = await db.productVariant.findFirst({
      where: { barcode, product: { tenantId: session.tenantId, branchId: prod.branchId } },
      select: { id: true },
    })
    if (taken) return NextResponse.json({ error: 'الباركود مستخدم بالفعل' }, { status: 400 })
  }
  try {
    // 👕 الرصيد الافتتاحي للمقاس بيدخل معروضاً بالكامل
    const created = await db.productVariant.create({
      data: { productId: pid, size, color, barcode, quantity, displayQty: quantity },
    })
    // Keep Product.quantity as the sum of all its variants from here on.
    await syncProductQuantityFromVariants(db, pid)
    // 📒 2026-10-18: رصيد افتتاحي للون/المقاس يتسجل في سجل الحركات (كان بيدخل المخزون من غير أثر)
    if (quantity > 0) {
      await db.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          branchId: prod.branchId,
          productId: pid,
          variantId: created.id,
          type: 'in',
          quantity,
          refType: 'manual',
          note: `رصيد افتتاحي — ${[color, size].filter(Boolean).join(' / ')}`,
          userId: session.userId,
        },
      })
    }
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002' || String(e?.message ?? '').includes('نفس الفرع')) {
      return NextResponse.json({ error: 'الباركود مستخدم بالفعل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل إنشاء المتغير' }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}