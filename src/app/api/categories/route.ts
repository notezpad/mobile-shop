import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` — on Cloudflare Workers this reuses
 * ONE PrismaClient per request (saves ~200-500ms per query that would
 * otherwise establish a new TCP+TLS+auth connection to Supabase).
 */

export async function GET() {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const cats = await db.category.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json(cats)
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
    return NextResponse.json({ ok: true })
  })
}
