import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { client } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('@prisma/client')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require('@prisma/adapter-pg')
  return {
    client: new PrismaClient({
      adapter: new PrismaPg({ connectionString: 'postgresql://postgres:pw@localhost:5432/shoptest' }),
    }),
  }
})

vi.mock('@/lib/db', () => ({ db: client, withDb: (fn: any) => fn() }))
vi.mock('@/lib/auth', () => ({
  requireAuth: async () => ({ tenantId: 't1', userId: 'u1', branchId: null }),
  authErrorResponse: () => null,
}))
vi.mock('@/lib/features', () => ({ requireModule: async () => {}, featureErrorResponse: () => null }))

import * as POs from '@/app/api/purchase-orders/route'
import * as PO from '@/app/api/purchase-orders/[id]/route'
import * as POReturns from '@/app/api/purchase-orders/[id]/returns/route'
import * as SupplierRoute from '@/app/api/suppliers/[id]/route'

const db = client as any
const json = (b: any, method = 'POST') =>
  new NextRequest('http://localhost/x', { method, body: JSON.stringify(b), headers: { 'content-type': 'application/json' } })
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })

async function mkProduct(name: string, qty = 0) {
  return db.product.create({ data: { tenantId: 't1', name, quantity: qty, cost: 0 } })
}
async function mkSupplier(name: string) {
  return db.supplier.create({ data: { tenantId: 't1', name } })
}
async function buy(items: { productId: number; quantity: number; cost: number }[], paid: number, supplierId: number | null) {
  const res = await POs.POST(json({ items, paid, supplierId }))
  return { res, body: await res.json() }
}
const balance = async (id: number) => (await db.supplier.findUnique({ where: { id } })).balance
const stock = async (id: number) => (await db.product.findUnique({ where: { id } })).quantity
const cashSum = async (source?: string) =>
  (await db.cashEntry.aggregate({ where: { tenantId: 't1', ...(source ? { source } : {}) }, _sum: { amount: true } }))._sum.amount ?? 0
const cashCount = async (source: string, refId: number) => db.cashEntry.count({ where: { source, refId } })

afterAll(async () => { await client.$disconnect() })

describe('#4 purchase creation: paid validation', () => {
  it('rejects negative / garbage paid', async () => {
    const p = await mkProduct('v1'); const s = await mkSupplier('S-v')
    for (const bad of [-100, 'abc', '1e999']) {
      const r = await POs.POST(json({ items: [{ productId: p.id, quantity: 1, cost: 10 }], paid: bad, supplierId: s.id }))
      expect(r.status, `paid=${bad}`).toBe(400)
    }
    expect(await balance(s.id)).toBe(0); expect(await stock(p.id)).toBe(0)
  })
  it('rejects paid > total without a supplier', async () => {
    const p = await mkProduct('v2')
    const r = await POs.POST(json({ items: [{ productId: p.id, quantity: 1, cost: 10 }], paid: 50, supplierId: null }))
    expect(r.status).toBe(400); expect(await stock(p.id)).toBe(0)
  })
  it('overpayment with a supplier becomes a NEGATIVE balance (credit)', async () => {
    const p = await mkProduct('v3'); const s = await mkSupplier('S-over')
    const before = await cashSum()
    const { res } = await buy([{ productId: p.id, quantity: 10, cost: 10 }], 150, s.id) // total 100, paid 150
    expect(res.status).toBe(201)
    expect(await balance(s.id)).toBe(-50)
    expect((await cashSum()) - before).toBe(-150)
  })
  it('credit purchase: balance += total-paid ; full cash: balance unchanged', async () => {
    const p = await mkProduct('v4'); const s = await mkSupplier('S-credit')
    await buy([{ productId: p.id, quantity: 10, cost: 10 }], 30, s.id)
    expect(await balance(s.id)).toBe(70)
    await buy([{ productId: p.id, quantity: 1, cost: 10 }], 10, s.id)
    expect(await balance(s.id)).toBe(70)
  })
})

describe('#1 partial returns + accounting', () => {
  it('cash order: return part of one item → stock, cash, balance, status, returnedQty', async () => {
    const A = await mkProduct('A'); const B = await mkProduct('B'); const s = await mkSupplier('S-1')
    const { body: po } = await buy([{ productId: A.id, quantity: 10, cost: 50 }, { productId: B.id, quantity: 5, cost: 100 }], 1000, s.id)
    expect(po.status).toBe('مكتملة')
    const itemA = po.items.find((i: any) => i.productId === A.id)
    const cash0 = await cashSum()

    const r = await POReturns.POST(json({ items: [{ itemId: itemA.id, quantity: 3 }] }), ctx(po.id))
    const out = await r.json()
    expect(r.status, JSON.stringify(out)).toBe(201)
    expect(out.total).toBe(150); expect(out.refund).toBe(150); expect(out.status).toBe('مرتجعة جزئياً')
    expect(await stock(A.id)).toBe(7); expect(await stock(B.id)).toBe(5)         // only A moved
    expect(await balance(s.id)).toBe(0)                                            // 150 goods - 150 cash back
    expect((await cashSum()) - cash0).toBe(150)
    const after = await db.purchaseOrder.findUnique({ where: { id: po.id }, include: { items: true } })
    expect(after.status).toBe('مرتجعة جزئياً'); expect(after.refunded).toBe(150)
    expect(after.items.find((i: any) => i.id === itemA.id).returnedQty).toBe(3)

    // credit-only return (supplier gives no cash): balance goes negative, till untouched
    const c1 = await cashSum()
    const r2 = await POReturns.POST(json({ items: [{ itemId: itemA.id, quantity: 2 }], refund: 0 }), ctx(po.id))
    expect(r2.status).toBe(201)
    expect(await balance(s.id)).toBe(-100); expect(await cashSum()).toBe(c1)

    // cannot exceed what is left (10 - 3 - 2 = 5)
    const r3 = await POReturns.POST(json({ items: [{ itemId: itemA.id, quantity: 6 }] }), ctx(po.id))
    expect(r3.status).toBe(400)
    expect(await stock(A.id)).toBe(5)

    // return everything that is left through the legacy DELETE → fully returned
    const r4 = await PO.DELETE(json({}, 'DELETE'), ctx(po.id))
    expect(r4.status).toBe(200)
    expect((await db.purchaseOrder.findUnique({ where: { id: po.id } })).status).toBe('مرتجعة')
    expect(await stock(A.id)).toBe(0); expect(await stock(B.id)).toBe(0)
    // 2nd DELETE is refused
    expect((await PO.DELETE(json({}, 'DELETE'), ctx(po.id))).status).toBe(400)
    expect(await stock(A.id)).toBe(0)
    // history rows exist
    expect(await db.purchaseReturn.count({ where: { purchaseOrderId: po.id } })).toBe(3)
  })

  it('credit order: full return reduces the debt, no cash enters the till', async () => {
    const P = await mkProduct('C1'); const s = await mkSupplier('S-2')
    const { body: po } = await buy([{ productId: P.id, quantity: 10, cost: 50 }], 0, s.id) // owes 500
    expect(await balance(s.id)).toBe(500)
    const c0 = await cashSum()
    expect((await PO.DELETE(json({}, 'DELETE'), ctx(po.id))).status).toBe(200)
    expect(await balance(s.id)).toBe(0); expect(await cashSum()).toBe(c0); expect(await stock(P.id)).toBe(0)
  })

  it('order with no supplier: refund must equal the return value', async () => {
    const P = await mkProduct('N1')
    const { body: po } = await buy([{ productId: P.id, quantity: 4, cost: 25 }], 100, null)
    const it = po.items[0]
    const bad = await POReturns.POST(json({ items: [{ itemId: it.id, quantity: 2 }], refund: 10 }), ctx(po.id))
    expect(bad.status).toBe(400)
    const c0 = await cashSum()
    const ok = await POReturns.POST(json({ items: [{ itemId: it.id, quantity: 2 }] }), ctx(po.id))
    expect(ok.status).toBe(201); expect((await cashSum()) - c0).toBe(50)
  })

  it('legacy fully-returned order (pre-migration) cannot be returned again', async () => {
    const r = await PO.DELETE(json({}, 'DELETE'), ctx(1))
    expect(r.status).toBe(400)
  })
})

describe('#2 double-click / replay race', () => {
  it('5 concurrent full returns of the same order → exactly ONE effect', async () => {
    const P = await mkProduct('R1', 0); const s = await mkSupplier('S-race')
    const { body: po } = await buy([{ productId: P.id, quantity: 10, cost: 20 }], 50, s.id) // total 200 paid 50 → owes 150
    expect(await balance(s.id)).toBe(150); expect(await stock(P.id)).toBe(10)
    const c0 = await cashSum()

    const results = await Promise.all(Array.from({ length: 5 }, () => PO.DELETE(json({}, 'DELETE'), ctx(po.id))))
    const codes = results.map((r) => r.status).sort()
    expect(codes.filter((c) => c === 200)).toHaveLength(1)
    expect(codes.filter((c) => c !== 200)).toHaveLength(4)

    expect(await stock(P.id)).toBe(0)                       // decremented once (not -40)
    expect(await balance(s.id)).toBe(0)                     // 150 - 150 (once), not -450
    expect((await cashSum()) - c0).toBe(50)                 // +50 once, not +250
    expect(await cashCount('purchase_refund', po.id)).toBe(1)
    expect(await db.purchaseReturn.count({ where: { purchaseOrderId: po.id } })).toBe(1)
    expect((await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id } })).returnedQty).toBe(10)
  })

  it('concurrent partial returns can never exceed the purchased quantity', async () => {
    const P = await mkProduct('R2', 0); const s = await mkSupplier('S-race2')
    const { body: po } = await buy([{ productId: P.id, quantity: 10, cost: 10 }], 100, s.id)
    const itemId = po.items[0].id
    // 8 requests x 3 pieces = 24 > 10 → at most 3 can win (9 pieces)
    const rs = await Promise.all(Array.from({ length: 8 }, () => POReturns.POST(json({ items: [{ itemId, quantity: 3 }] }), ctx(po.id))))
    const wins = rs.filter((r) => r.status === 201).length
    expect(wins).toBe(3)
    expect(await stock(P.id)).toBe(1)
    expect((await db.purchaseOrderItem.findUnique({ where: { id: itemId } })).returnedQty).toBe(9)
  })
})

describe('#3 supplier deletion', () => {
  it('blocks a supplier with balance, orders or payments; allows a clean one', async () => {
    // balance != 0
    const sBal = await mkSupplier('D-bal'); await db.supplier.update({ where: { id: sBal.id }, data: { balance: 40 } })
    expect((await SupplierRoute.DELETE(json({}, 'DELETE'), ctx(sBal.id))).status).toBe(409)

    // history: zero balance but has a paid order
    const P = await mkProduct('D1'); const sOrd = await mkSupplier('D-orders')
    await buy([{ productId: P.id, quantity: 1, cost: 10 }], 10, sOrd.id)
    expect(await balance(sOrd.id)).toBe(0)
    expect((await SupplierRoute.DELETE(json({}, 'DELETE'), ctx(sOrd.id))).status).toBe(409)
    expect(await db.purchaseOrder.count({ where: { supplierId: sOrd.id } })).toBe(1)   // still linked

    // history: only payments
    const sPay = await mkSupplier('D-pay')
    await db.supplierPayment.create({ data: { tenantId: 't1', supplierId: sPay.id, amount: 5 } })
    expect((await SupplierRoute.DELETE(json({}, 'DELETE'), ctx(sPay.id))).status).toBe(409)
    expect(await db.supplierPayment.count({ where: { supplierId: sPay.id } })).toBe(1) // NOT cascaded away

    // DB-level last line of defence (bypassing the API)
    await expect(db.$executeRawUnsafe(`DELETE FROM "Supplier" WHERE id = ${sPay.id}`)).rejects.toThrow()
    await expect(db.$executeRawUnsafe(`DELETE FROM "Supplier" WHERE id = ${sOrd.id}`)).rejects.toThrow()

    // clean supplier → deleted; unknown → 404
    const clean = await mkSupplier('D-clean')
    expect((await SupplierRoute.DELETE(json({}, 'DELETE'), ctx(clean.id))).status).toBe(200)
    expect(await db.supplier.findUnique({ where: { id: clean.id } })).toBeNull()
    expect((await SupplierRoute.DELETE(json({}, 'DELETE'), ctx(999999))).status).toBe(404)
  })
})

describe('reports query shape', () => {
  it('partial-returns aggregate runs', async () => {
    const r = await db.purchaseReturn.aggregate({
      where: { tenantId: 't1', purchaseOrder: { createdAt: { gte: new Date('2000-01-01'), lt: new Date('2100-01-01') }, status: 'مرتجعة جزئياً' } },
      _sum: { total: true },
    })
    expect(r._sum.total).toBeGreaterThan(0)
  })
})
