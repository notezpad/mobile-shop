import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModulePermission, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/** GET — fetch a single transfer with its items (used by detail dialog). */
async function __GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModulePermission(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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
async function __DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModulePermission(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
