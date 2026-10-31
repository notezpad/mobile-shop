import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import {
  requireModule,
  featureErrorResponse,
  requireBlindStocktakeAccess,
} from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * 🫥 2026-10-31 (التحديث الحادي عشر) — البحث الأعمي لمحطة الجرد.
 *
 * ده المسار الوحيد اللي العدّاد الأعمي بيمسح من خلاله — **مضمون من غير أي
 * أرقام**: لا كميات نظام، لا فروق، لا تكاليف، لا أسعار. بيرجّع بس:
 *   - اسم الصنف + الباركود + هل بيع بالوزن
 *   - ألوانه ومقاساته **كأسماء فقط** (id/size/color/barcode) عشان شبكة العدّ
 *
 * القاعدة الأمنية: حتى لو العدّاد فتح الـ DevTools وشاف الرد الخام، مفيش
 * أي رقم متوقع فيه — العتمة على السيرفر مش على الشاشة. والـ GET أصولاً
 * بيتخزن أوفلاين في جهاز العدّاد، فالبيانات النقية دي هي اللي بتتخزن.
 *
 * الوصول: موديول «المخزون» (قراءة) أو صلاحية «الجرد الأعمي» المستقلة.
 * البحث: باركود مطابق تام أولاً، ثم اسم يحتوي النص (نفس سلوك المحطة القديم).
 */

interface VariantLite {
  id: number
  size: string | null
  color: string | null
  barcode: string | null
}

interface LookupProduct {
  id: number
  name: string
  barcode: string | null
  soldByWeight: boolean
  variants: VariantLite[]
}

async function __GETImpl(req: NextRequest, sql: Sql) {
  let s
  try {
    s = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // بابين زي محطة الجرد: موديول المخزون أو صلاحية الجرد الأعمي المستقلة
  let allowed = false
  try {
    await requireModule(s, 'inventory')
    allowed = true
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (!fe) throw e
  }
  if (!allowed) {
    try {
      requireBlindStocktakeAccess(s)
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (!q) return NextResponse.json({ results: [], variantHit: null })

  const branchIdRaw = parseInt(url.searchParams.get('branchId') ?? '', 10)
  const branchId = Number.isFinite(branchIdRaw) ? branchIdRaw : (s.branchId ?? null)
  // عزل الفرع بنفس قاعدة المحطة: منتجات الفرع + غير المسندة (branchId IS NULL)
  const branchScope =
    branchId != null
      ? sql` AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)`
      : sql``

  // 1) باركود لون/مقاس؟ — بيرجّع المنتج + المتغير بدون أي كمية
  const variantRows = await sql<{
    id: number
    size: string | null
    color: string | null
    barcode: string | null
    productId: number
    productName: string
    productBarcode: string | null
    soldByWeight: boolean
  }[]>`
    SELECT pv."id", pv."size", pv."color", pv."barcode",
           p."id" AS "productId", p."name" AS "productName",
           p."barcode" AS "productBarcode", p."soldByWeight"
    FROM "ProductVariant" pv
    JOIN "Product" p ON p."id" = pv."productId"
    WHERE p."tenantId" = ${s.tenantId}
      AND pv."barcode" = ${q}
      ${branchScope}
    LIMIT 1`

  const variantHit =
    variantRows.length > 0
      ? {
          product: {
            id: variantRows[0].productId,
            name: variantRows[0].productName,
            barcode: variantRows[0].productBarcode,
            soldByWeight: variantRows[0].soldByWeight === true,
          },
          variant: {
            id: variantRows[0].id,
            size: variantRows[0].size,
            color: variantRows[0].color,
            barcode: variantRows[0].barcode,
          },
        }
      : null

  // 2) بحث المنتجات: باركود تام أولاً ثم الاسم — بدون كميات وتكاليف خالص
  const productRows = await sql<{
    id: number
    name: string
    barcode: string | null
    soldByWeight: boolean
  }[]>`
    SELECT p."id", p."name", p."barcode", p."soldByWeight"
    FROM "Product" p
    WHERE p."tenantId" = ${s.tenantId}
      ${branchScope}
      AND (p."barcode" = ${q} OR p."name" ILIKE ${'%' + q + '%'})
    ORDER BY (p."barcode" = ${q}) DESC, p."name" ASC
    LIMIT 8`

  // ألوان ومقاسات المنتجات المطابقة — أسماء فقط
  const ids = productRows.map((r) => r.id)
  const variantsByProduct = new Map<number, VariantLite[]>()
  if (ids.length > 0) {
    const vs = await sql<(VariantLite & { productId: number })[]>`
      SELECT pv."productId", pv."id", pv."size", pv."color", pv."barcode"
      FROM "ProductVariant" pv
      WHERE pv."productId" IN (${ids})
      ORDER BY pv."id" ASC
      LIMIT 400`
    for (const v of vs) {
      const list = variantsByProduct.get(v.productId) ?? []
      list.push({ id: v.id, size: v.size, color: v.color, barcode: v.barcode })
      variantsByProduct.set(v.productId, list)
    }
  }

  const results: LookupProduct[] = productRows.map((r) => ({
    id: r.id,
    name: r.name,
    barcode: r.barcode,
    soldByWeight: r.soldByWeight === true,
    variants: variantsByProduct.get(r.id) ?? [],
  }))

  return NextResponse.json({ results, variantHit })
}

export async function GET(req: NextRequest) {
  return withSql((sql) => __GETImpl(req, sql))
}
