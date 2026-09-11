import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET — fetch a single transfer with its items (used by detail dialog). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const tid = parseInt(id, 10)
  const t = await db.transfer.findUnique({
    where: { id: tid },
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      items: { include: { product: { select: { name: true, barcode: true } } } },
    },
  })
  if (!t || t.tenantId !== s.tenantId) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }
  if (s.branchId && t.fromBranchId !== s.branchId && t.toBranchId !== s.branchId) {
    return NextResponse.json({ error: 'لا صلاحية' }, { status: 403 })
  }
  return NextResponse.json(t)
}

/** DELETE — cancel a *pending* transfer. Completed transfers cannot be cancelled. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id } = await ctx.params
  const tid = parseInt(id, 10)
  const t = await db.transfer.findUnique({
    where: { id: tid },
    include: { items: true, fromBranch: { select: { name: true } }, toBranch: { select: { name: true } } },
  })
  if (!t || t.tenantId !== s.tenantId) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }
  if (t.status !== 'pending') {
    return NextResponse.json({ error: 'لا يمكن إلغاء تحويل غير معلّق' }, { status: 400 })
  }
  await db.transfer.update({
    where: { id: tid },
    data: { status: 'cancelled' },
  })
  return NextResponse.json({ ok: true })
}
