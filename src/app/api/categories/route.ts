import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { matchEdgeCache, putEdgeCache, purgeCatalogCaches } from '@/lib/edgeCache'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET بقى SQL مباشر عبر postgres.js —
 * نفس الرد بالظبط (مصفوفة { id, name }). POST/PUT/DELETE فضلوا Prisma
 * (عمليات نادرة فيها معاملات).
 */

export async function GET() {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-mowazaf: module 'products'
    try { requireModule(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    // ⚡ v9: كاش حافة للتصنيفات — بتتغير نادراً جداً فTTL أطول (60 ثانية)،
    // وأي إضافة/تعديل/حذف بيمسحها فوراً
    const hit = await matchEdgeCache('/api/categories', '', session.tenantId, '3')
    if (hit) return hit

    const cats = await sql<{ id: number; name: string }[]>`
      SELECT "id", "name" FROM "Category"
      WHERE "tenantId" = ${session.tenantId}
      ORDER BY "name" ASC`
    const catsRes = NextResponse.json(cats)
    await putEdgeCache(catsRes.clone(), '/api/categories', '', session.tenantId, 60, '3')
    return catsRes
  })
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-kateb-mowazaf: module 'products'
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const body = await req.json().catch(() => null)
    if (!body?.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    const name = String(body.name).trim()
    const existing = await db.category.findFirst({
      where: { tenantId: session.tenantId, name },
    })
    if (existing) {
      return NextResponse.json(existing)
    }
    const created = await db.category.create({
      data: { tenantId: session.tenantId, name },
    })
    // ⚡ v9: مسح كاش الكتالوج بعد إضافة تصنيف
    await purgeCatalogCaches(session.tenantId, session.branchId)
    return NextResponse.json(created, { status: 201 })
  })
}

export async function PUT(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-kateb-mowazaf: module 'products'
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const body = await req.json().catch(() => null)
    if (!body?.id || !body?.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }
    const id = parseInt(body.id, 10)
    const newName = String(body.name).trim()
    const cat = await db.category.findUnique({ where: { id } })
    if (!cat || cat.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'التصنيف غير موجود' }, { status: 404 })
    }
    const oldName = cat.name
    await db.$transaction([
      db.category.update({ where: { id }, data: { name: newName } }),
      db.product.updateMany({
        where: { tenantId: session.tenantId, category: oldName },
        data: { category: newName },
      }),
    ])
    // ⚡ v9: مسح كاش الكتالوج — إعادة التسمية بتغير صفوف المنتجات كمان
    await purgeCatalogCaches(session.tenantId, session.branchId)
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // saleh-kateb-mowazaf: module 'products'
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const { searchParams } = new URL(req.url)
    const id = parseInt(searchParams.get('id') ?? '', 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
    }
    const cat = await db.category.findUnique({ where: { id } })
    if (!cat || cat.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'التصنيف غير موجود' }, { status: 404 })
    }
    await db.$transaction([
      db.product.updateMany({
        where: { tenantId: session.tenantId, category: cat.name },
        data: { category: null },
      }),
      db.category.delete({ where: { id } }),
    ])
    // ⚡ v9: مسح كاش الكتالوج — الحذف بيصفّر تصنيف منتجات كمان
    await purgeCatalogCaches(session.tenantId, session.branchId)
    return NextResponse.json({ ok: true })
  })
}
