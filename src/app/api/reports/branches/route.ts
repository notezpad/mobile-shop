import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
export const dynamic = 'force-dynamic'

export async function GET() {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  const branches = await db.branch.findMany({ where: { tenantId: s.tenantId }, orderBy: [{ isMain: 'desc' }, { id: 'asc' }] })
  const scope = s.branchId ? branches.filter(b => b.id === s.branchId) : branches
  const results = await Promise.all(scope.map(async (b) => {
    const sales = await db.sale.findMany({
      where: { tenantId: s.tenantId, branchId: b.id, status: 'مكتملة' },
      include: { items: true },
    })
    let totalSales = 0, totalProfit = 0
    for (const sale of sales) {
      totalSales += sale.total
      for (const it of sale.items) {
        totalProfit += (it.price - it.cost) * it.quantity
      }
    }
    const productCount = await db.product.count({ where: { tenantId: s.tenantId, branchId: b.id } })
    return {
      branchId: b.id, name: b.name, isMain: b.isMain,
      salesCount: sales.length,
      totalSales,
      totalProfit,
      productCount,
    }
  }))
  // Also include an "unassigned" bucket (sales without branchId) if visible
  if (!s.branchId) {
    const sales = await db.sale.findMany({ where: { tenantId: s.tenantId, branchId: null, status: 'مكتملة' }, include: { items: true } })
    if (sales.length) {
      let totalSales = 0, totalProfit = 0
      for (const sale of sales) {
        totalSales += sale.total
        for (const it of sale.items) totalProfit += (it.price - it.cost) * it.quantity
      }
      results.push({ branchId: 0, name: 'بدون فرع', isMain: false, salesCount: sales.length, totalSales, totalProfit, productCount: await db.product.count({ where: { tenantId: s.tenantId, branchId: null } }) })
    }
  }
  return NextResponse.json(results)
}
