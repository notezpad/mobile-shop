import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { sanitizeDesign } from '@/lib/label-design'

export const dynamic = 'force-dynamic'

/**
 * 🎨 التحديث 27: قوالب تصميم ملصقات الباركود (مصمم السحب والإفلات).
 *
 * GET  — قايمة قوالب المحل (أي مستخدم مسجّل — الطباعة مش مقتصرة على الأدمن).
 * POST — إنشاء قالب جديد (أدمن فقط) مع تنظيف التصميم قبل الحفظ.
 *
 * الحد الأقصى 30 قالب لكل محل — كفاية عملياً وبيمنع أي حشو للجدول.
 */

const MAX_TEMPLATES = 30

export async function GET() {
  return withDb(async () => {
    let s
    try {
      s = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const rows = await db.labelTemplate.findMany({
      where: { tenantId: s.tenantId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        widthMm: true,
        heightMm: true,
        elements: true,
        isDefault: true,
      },
    })
    return NextResponse.json(rows)
  })
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const b = await req.json().catch(() => null)
    const name = String(b?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'اسم القالب مطلوب' }, { status: 400 })
    if (name.length > 60) return NextResponse.json({ error: 'اسم القالب طويل جداً' }, { status: 400 })

    const design = sanitizeDesign({ widthMm: b?.widthMm, heightMm: b?.heightMm, elements: b?.elements })
    if (!design || design.elements.length === 0) {
      return NextResponse.json({ error: 'التصميم فاضي أو غير صالح' }, { status: 400 })
    }

    const count = await db.labelTemplate.count({ where: { tenantId: s.tenantId } })
    if (count >= MAX_TEMPLATES) {
      return NextResponse.json(
        { error: `وصلت للحد الأقصى (${MAX_TEMPLATES} قالب) — امسح قالب قديم الأول` },
        { status: 400 },
      )
    }

    const isDefault = b?.isDefault === true
    const created = await db.labelTemplate.create({
      data: {
        tenantId: s.tenantId,
        name,
        widthMm: design.widthMm,
        heightMm: design.heightMm,
        elements: design.elements,
        isDefault,
      },
    })
    if (isDefault) {
      await db.labelTemplate.updateMany({
        where: { tenantId: s.tenantId, id: { not: created.id } },
        data: { isDefault: false },
      })
    }
    return NextResponse.json(created, { status: 201 })
  })
}
