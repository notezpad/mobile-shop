import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const where: any = { tenantId: s.tenantId }
  if (s.branchId) where.branchId = s.branchId
  const rows = await db.stocktake.findMany({
    where,
    orderBy: { id: 'desc' },
    include: {
      branch: { select: { name: true } },
      items: { include: { product: { select: { name: true, barcode: true } } } },
    },
  })
  // `createdBy` on Stocktake is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    createdByName: r.createdBy ? (userNameById.get(r.createdBy) ?? null) : null,
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const b = await req.json().catch(() => null)
  const branchId = s.branchId ?? (b?.branchId ? parseInt(b.branchId, 10) : null)
  const items = Array.isArray(b?.items) ? b.items : []
  const commit = b?.commit === true
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للجرد' }, { status: 400 })

  const productIds = items.map((it: any) => parseInt(it.productId, 10)).filter(Boolean)
  const products = await db.product.findMany({ where: { id: { in: productIds }, tenantId: s.tenantId } })
  const pMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))

  const created = await db.$transaction(async (tx) => {
    const st = await tx.stocktake.create({
      data: {
        tenantId: s.tenantId,
        branchId,
        status: commit ? 'committed' : 'draft',
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        committedAt: commit ? new Date() : null,
        items: {
          create: items.map((it: any) => {
            const pid = parseInt(it.productId, 10)
            const counted = parseInt(it.countedQty, 10) || 0
            const p = pMap.get(pid)
            const sys = p?.quantity ?? 0
            return { productId: pid, systemQty: sys, countedQty: counted, diff: counted - sys }
          }),
        },
      },
      include: { items: true },
    })
    if (commit) {
      for (const it of st.items) {
        if (it.diff !== 0) {
          await tx.product.update({ where: { id: it.productId }, data: { quantity: it.countedQty } })
          await tx.stockMovement.create({
            data: {
              tenantId: s.tenantId,
              branchId: branchId ?? null,
              productId: it.productId,
              type: 'stocktake',
              quantity: it.diff,
              refType: 'stocktake',
              refId: st.id,
              note: 'تسوية جرد',
              userId: s.userId,
            },
          })
        }
      }
    }
    return st
  })
  return NextResponse.json(created, { status: 201 })
}
