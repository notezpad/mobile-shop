import { test, expect, mock, beforeEach } from 'bun:test'

/**
 * POST /api/sales — behaviour tests against an in-memory fake of the DB layer.
 * Run ALONE:  bun test tests/pos     (mock.module is process-global; don't mix with other suites)
 */
const state: any = { sales: [], cash: [], customerBalance: 0, prods: [{ id: 1, name: 'قميص', cost: 4, quantity: 100, tenantId: 't1' }, { id: 2, name: 'بنطلون', cost: 8, quantity: 50, tenantId: 't1' }] }
const txApi = {
  sale: { create: async ({ data }: any) => { const row = { id: 77, ...data, items: data.items.create.map((i: any, n: number) => ({ id: n, ...i, variant: null })), customer: null, createdAt: new Date() }; state.sales.push(row); return row } },
  cashEntry: { create: async ({ data }: any) => { state.cash.push(data); return data } },
  customer: { update: async ({ data }: any) => { state.customerBalance += data.balance.increment } },
}
mock.module('@/lib/db', () => ({
  withDb: (fn: any) => fn(),
  db: {
    product: { findMany: async () => state.prods },
    productUnit: { findMany: async () => [] },
    productVariant: { findMany: async () => [] },
    customer: { findUnique: async ({ where }: any) => (where.id === 5 ? { id: 5, tenantId: 't1' } : null) },
    tenant: { findUnique: async () => ({ invoicePrefix: 'INV' }) },
    sale: { findFirst: async ({ where }: any) => (where.clientRef ? state.sales.find((s: any) => s.clientRef === where.clientRef) ?? null : null) },
    $transaction: async (fn: any) => fn(txApi),
  },
}))
mock.module('@/lib/auth', () => ({ requireAuth: async () => ({ tenantId: 't1', userId: 'u1', branchId: null }), authErrorResponse: () => null }))
mock.module('@/lib/features', () => ({ requireCapability: async () => {}, featureErrorResponse: () => null }))
mock.module('@/lib/deduct-stock', () => ({ deductStock: async () => {} }))
mock.module('@/lib/tenantTime', () => ({ getTenantTimezone: async () => 'UTC', localDateStrToUtcBounds: () => new Date() }))

async function post(body: any) {
  const { POST } = await import('@/app/api/sales/route')
  const res = await POST(new Request('http://x/api/sales', { method: 'POST', body: JSON.stringify(body) }) as any)
  return { status: res.status, json: await res.json() }
}
beforeEach(() => { state.sales = []; state.cash = []; state.customerBalance = 0 })
const items = [{ productId: 1, quantity: 3, price: 10 }, { productId: 2, quantity: 2, price: 35 }] // 30 + 70 = 100

test('discount folds into item prices; totals + per-method drawer entries are exact', async () => {
  const r = await post({ items, discount: { type: 'pct', value: 10 }, payments: [{ method: 'cash', amount: 50 }, { method: 'instapay', amount: 40 }], note: 'هدية', clientRef: 'r1' })
  expect(r.status).toBe(201)
  const sale = state.sales[0]
  expect(sale.total).toBe(90)
  expect(sale.subtotal).toBe(100)
  expect(sale.discount).toBe(10)
  expect(sale.paid).toBe(90)
  expect(sale.note).toBe('هدية')
  const sum = r.json.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0)
  expect(Math.abs(sum - 90)).toBeLessThan(1e-9) // returns/profit reports see the discounted prices
  expect(state.cash.map((c: any) => [c.method, c.amount, c.source])).toEqual([['cash', 50, 'sale'], ['instapay', 40, 'sale']])
  expect(state.customerBalance).toBe(0)
})

test('same clientRef replayed → 200 with the SAME invoice, nothing created twice', async () => {
  const a = await post({ items, payments: [{ method: 'cash', amount: 100 }], clientRef: 'dup-1' })
  const b = await post({ items, payments: [{ method: 'cash', amount: 100 }], clientRef: 'dup-1' })
  expect(a.status).toBe(201)
  expect(b.status).toBe(200)
  expect(state.sales).toHaveLength(1)
  expect(state.cash).toHaveLength(1)
})

test('credit sale → customer balance += unpaid; without customer → 400', async () => {
  const ok = await post({ items, customerId: 5, payments: [{ method: 'cash', amount: 30 }] })
  expect(ok.status).toBe(201)
  expect(state.customerBalance).toBe(70)
  expect((await post({ items, payments: [{ method: 'cash', amount: 30 }] })).status).toBe(400)
})

test('rejects overpayment, unknown method, and a discount that leaves nothing to pay', async () => {
  expect((await post({ items, payments: [{ method: 'cash', amount: 500 }] })).status).toBe(400)
  expect((await post({ items, payments: [{ method: 'bitcoin', amount: 100 }] })).status).toBe(400)
  expect((await post({ items, discount: { type: 'amount', value: 100 }, payments: [] })).status).toBe(400)
})

test('legacy client (single `paid`, no payments array) behaves as before', async () => {
  const r = await post({ items, paid: 100 })
  expect(r.status).toBe(201)
  expect(state.sales[0].total).toBe(100)
  expect(state.sales[0].subtotal).toBeNull()
  expect(state.cash).toHaveLength(1)
  expect(state.cash[0].method).toBeUndefined() // old single method-less entry
  await post({ items, paid: 999 })
  expect(state.sales[1].paid).toBe(100) // never records more than the invoice
})
