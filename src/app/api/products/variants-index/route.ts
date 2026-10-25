import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireCapability, requireModule, featureErrorResponse } from '@/lib/features'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * 🎨 فهرس المتغيرات للأوفلاين: كل (لون/مقاس) لكل منتجات المحل في طلبات مُرقّمة بالـ cursor
 * (id تصاعدي). الـ prewarm بيسحبه ويخزنه في IndexedDB عشان:
 *   - دايلوج اختيار اللون/المقاس + الملصقات يشتغلوا أوفلاين لأي منتج، مش بس اللي اتفتح قبل كده.
 *   - مسح باركود متغير أوفلاين يتعرّف على المتغير الصح.
 *
 * قراءة بس. الباقات اللي مفيهاش المتغيرات بترجع قايمة فاضية (مش خطأ) عشان الـ prewarm يعدّي بهدوء.
 */
type Row = {
  id: number
  productId: number
  size: string | null
  color: string | null
  barcode: string | null
  quantity: number
}

export async function GET(req: NextRequest) {
  return withSql(async (sql) => {
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
    try {
      await requireCapability(session, 'variants')
    } catch {
      return NextResponse.json({ data: [], nextCursor: null })
    }

    const sp = req.nextUrl.searchParams
    const cursor = Math.max(0, parseInt(sp.get('cursor') || '0', 10) || 0)
    const limit = Math.min(2000, Math.max(1, parseInt(sp.get('limit') || '1000', 10) || 1000))

    const rows = await sql<Row[]>`
      SELECT v."id", v."productId", v."size", v."color", v."barcode", v."quantity"
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      WHERE p."tenantId" = ${session.tenantId} AND v."id" > ${cursor}
      ORDER BY v."id" ASC
      LIMIT ${limit}`
    const nextCursor = rows.length === limit ? Number(rows[rows.length - 1].id) : null
    return NextResponse.json({ data: rows, nextCursor })
  })
}
