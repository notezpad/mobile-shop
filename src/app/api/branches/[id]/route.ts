import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

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
    // detach references then delete
    await db.product.updateMany({ where: { branchId: bid, tenantId: s.tenantId }, data: { branchId: null } })
    await db.user.updateMany({ where: { branchId: bid, tenantId: s.tenantId }, data: { branchId: null } })
    await db.branch.delete({ where: { id: bid } })
    return NextResponse.json({ ok: true })
  })
}
