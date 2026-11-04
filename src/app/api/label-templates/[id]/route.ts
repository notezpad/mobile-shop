import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { sanitizeDesign } from '@/lib/label-design'

export const dynamic = 'force-dynamic'

/**
 * 🎨 التحديث 27: تعديل/حذف قالب تصميم ملصق — دايماً داخل حدود المحل.
 * PUT    — تحديث الاسم/المقاس/العناصر/الافتراضي (أدمن فقط).
 * DELETE — حذف القالب (أدمن فقط).
 */

type Ctx = { params: Promise<{ id: string }> }

async function ownedTemplate(tenantId: string, idRaw: string) {
  const id = Number(idRaw)
  if (!Number.isInteger(id) || id <= 0) return null
  return db.labelTemplate.findFirst({ where: { id, tenantId } })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const { id } = await ctx.params
    const existing = await ownedTemplate(s.tenantId, id)
    if (!existing) return NextResponse.json({ error: 'القالب غير موجود' }, { status: 404 })

    const b = await req.json().catch(() => null)
    const name = String(b?.name ?? existing.name).trim()
    if (!name) return NextResponse.json({ error: 'اسم القالب مطلوب' }, { status: 400 })
    if (name.length > 60) return NextResponse.json({ error: 'اسم القالب طويل جداً' }, { status: 400 })

    const design = sanitizeDesign(
      { widthMm: b?.widthMm ?? existing.widthMm, heightMm: b?.heightMm ?? existing.heightMm, elements: b?.elements ?? existing.elements },
      Number(existing.widthMm),
      Number(existing.heightMm),
    )
    if (!design || design.elements.length === 0) {
      return NextResponse.json({ error: 'التصميم فاضي أو غير صالح' }, { status: 400 })
    }

    const isDefault = b?.isDefault === true
    const updated = await db.labelTemplate.update({
      where: { id: existing.id },
      data: {
        name,
        widthMm: design.widthMm,
        heightMm: design.heightMm,
        elements: design.elements,
        isDefault,
      },
    })
    if (isDefault) {
      await db.labelTemplate.updateMany({
        where: { tenantId: s.tenantId, id: { not: existing.id } },
        data: { isDefault: false },
      })
    }
    return NextResponse.json(updated)
  })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const { id } = await ctx.params
    const existing = await ownedTemplate(s.tenantId, id)
    if (!existing) return NextResponse.json({ error: 'القالب غير موجود' }, { status: 404 })
    await db.labelTemplate.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true })
  })
}
