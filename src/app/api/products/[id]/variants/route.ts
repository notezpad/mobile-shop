import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse } from '@/lib/features'
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
      SELECT "id", "productId", "size", "color", "barcode", "quantity", "createdAt"
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
  try {
    const created = await db.productVariant.create({
      data: { productId: pid, size, color, barcode, quantity },
    })
    // Keep Product.quantity as the sum of all its variants from here on.
    await syncProductQuantityFromVariants(db, pid)
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'الباركود مستخدم بالفعل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل إنشاء المتغير' }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}