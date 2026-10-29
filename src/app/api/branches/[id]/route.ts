import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` — reuses ONE PrismaClient per request
 * on Cloudflare Workers (saves ~200-500ms per extra db.* call).
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const { id } = await ctx.params
    const bid = parseInt(id, 10)
    const branch = await db.branch.findUnique({ where: { id: bid } })
    if (!branch || branch.tenantId !== s.tenantId) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    }
    const b = await req.json().catch(() => null)
    const updated = await db.branch.update({
      where: { id: bid },
      data: {
        name: b?.name ? String(b.name).trim() : branch.name,
        address: b?.address !== undefined ? (b.address ? String(b.address) : null) : branch.address,
        phone: b?.phone !== undefined ? (b.phone ? String(b.phone) : null) : branch.phone,
        active: b?.active !== undefined ? Boolean(b.active) : branch.active,
      },
    })
    // ⚡ v12: تعديل فرع → امسح كاش الفروع وتقرير الفروع فورًا
    await purgeEdgeCache([PURGE_KEYS.branches, PURGE_KEYS.reportsBranches], s.tenantId, '1')
    return NextResponse.json(updated)
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    const { id } = await ctx.params
    const bid = parseInt(id, 10)
    const branch = await db.branch.findUnique({ where: { id: bid } })
    if (!branch || branch.tenantId !== s.tenantId) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
    }
    // 🏬 الفرع الرئيسي مايتحذفش طول ما فيه فروع تانية (وإلا المنتجات والموظفين يبقوا «سايبين»)
    const others = await db.branch.count({ where: { tenantId: s.tenantId, id: { not: bid } } })
    if (branch.isMain && others > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف الفرع الرئيسي — احذف الفروع الأخرى أولاً' },
        { status: 400 }
      )
    }
    // منتجات وموظفين الفرع المحذوف بينتقلوا للفرع الرئيسي — مش NULL: الموظف بدون فرع
    // بياخد صلاحية رؤية كل الفروع، والمنتج بدون فرع كان بيظهر للكل.
    const mainBranch = branch.isMain
      ? null
      : await db.branch.findFirst({ where: { tenantId: s.tenantId, isMain: true }, select: { id: true } })
    const fallbackId = mainBranch?.id ?? null
    await db.product.updateMany({ where: { branchId: bid, tenantId: s.tenantId }, data: { branchId: fallbackId } })
    await db.user.updateMany({ where: { branchId: bid, tenantId: s.tenantId }, data: { branchId: fallbackId } })
    await db.branch.delete({ where: { id: bid } })
    // ⚡ v12: حذف فرع → امسح كاش الفروع وتقرير الفروع فورًا
    await purgeEdgeCache([PURGE_KEYS.branches, PURGE_KEYS.reportsBranches], s.tenantId, '1')
    return NextResponse.json({ ok: true })
  })
}
