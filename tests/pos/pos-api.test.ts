import { test, expect, mock, beforeEach } from 'bun:test'

/**
 * POS API — behaviour tests (sales, manager approval, settings, shifts, returns) against an in-memory fake of the DB layer.
 * Run ALONE:  bun test tests/pos     (mock.module is process-global; don't mix with other suites)
 */
const state: any = { requireShift: false, shifts: [] as any[], cashRows: [] as any[], returnItem: null as any, stock: [] as any[], role: 'ADMIN', maxPct: 100, pinHash: null as string | null, failCount: 0, lockedUntil: null as Date | null, sales: [], cash: [], customerBalance: 0, prods: [{ id: 1, name: 'قميص', cost: 4, quantity: 100, tenantId: 't1' }, { id: 2, name: 'بنطلون', cost: 8, quantity: 50, tenantId: 't1' }] }
const txApi = {
  sale: { create: async ({ data }: any) => { const row = { id: 77, ...data, items: data.items.create.map((i: any, n: number) => ({ id: n, ...i, variant: null })), customer: null, createdAt: new Date() }; state.sales.push(row); return row } },
  cashEntry: { create: async ({ data }: any) => { state.cash.push(data); return data } },
  customer: { update: async ({ data }: any) => { state.customerBalance += data.balance.increment ?? -data.balance.decrement } },
  product: { update: async ({ data }: any) => { state.stock.push(data) } },
  productVariant: { update: async () => {}, findMany: async () => [] },
  stockMovement: { create: async () => {} },
  saleItem: { update: async () => {} },
}
Object.assign(txApi.sale, { update: async ({ data }: any) => { state.saleUpdates = [...(state.saleUpdates ?? []), data] } })
mock.module('@/lib/db', () => ({
  withDb: (fn: any) => fn(),
  db: {
    product: { findMany: async () => state.prods },
    productUnit: { findMany: async () => [] },
    productVariant: { findMany: async () => [] },
    customer: { findUnique: async ({ where }: any) => (where.id === 5 ? { id: 5, tenantId: 't1' } : null) },
    tenant: {
      findUnique: async () => ({
        invoicePrefix: 'INV',
        posEmployeeMaxDiscountPct: state.maxPct,
        dynamicRetailPricingEnabled: false,
        defaultRetailMarginPercent: 20,
        posManagerPinHash: state.pinHash,
        posPinFailCount: state.failCount,
        posPinLockedUntil: state.lockedUntil,
        posRequireShift: state.requireShift,
      }),
      update: async ({ data }: any) => {
        if (data.posPinFailCount?.increment) state.failCount += data.posPinFailCount.increment
        else if (data.posPinFailCount === 0) state.failCount = 0
        if ('posPinLockedUntil' in data) state.lockedUntil = data.posPinLockedUntil
        if ('posManagerPinHash' in data) state.pinHash = data.posManagerPinHash
        if ('posEmployeeMaxDiscountPct' in data) state.maxPct = data.posEmployeeMaxDiscountPct
        if ('posRequireShift' in data) state.requireShift = data.posRequireShift
        return { posPinFailCount: state.failCount }
      },
    },
    sale: { findFirst: async ({ where }: any) => (where.clientRef ? state.sales.find((s: any) => s.clientRef === where.clientRef) ?? null : null) },
    user: { findMany: async () => [{ id: 'u1', name: 'أحمد' }] },
    cashEntry: { findMany: async () => state.cashRows },
    cashShift: {
      findFirst: async ({ where }: any) => [...state.shifts].reverse().find((x: any) => x.userId === where.userId && (where.closedAt === null ? x.closedAt == null : true)) ?? null,
      findMany: async () => [...state.shifts].reverse(),
      create: async ({ data }: any) => { const row = { id: state.shifts.length + 1, openedAt: new Date(), closedAt: null, ...data }; state.shifts.push(row); return row },
      update: async ({ where, data }: any) => { const row = state.shifts.find((x: any) => x.id === where.id); Object.assign(row, data); return row },
    },
    saleItem: { findUnique: async () => state.returnItem },
    $transaction: async (fn: any) => fn(txApi),
  },
}))
mock.module('@/lib/auth', () => ({
  requireAuth: async () => ({ tenantId: 't1', userId: 'u1', branchId: null, role: state.role }),
  requireAdmin: async () => {
    if (state.role === 'EMPLOYEE') throw new Error('FORBIDDEN')
    return { tenantId: 't1', userId: 'u1', branchId: null, role: state.role }
  },
  authErrorResponse: (e: any) => (e?.message === 'FORBIDDEN' ? { status: 403, body: { error: 'ممنوع — هذه العملية للمدير فقط' } } : null),
  hashPassword: async (p: string) => `h:${p}`,
  verifyPassword: async (p: string, stored: string) => stored === `h:${p}`,
}))
mock.module('@/lib/features', () => ({ requireCapability: async () => {}, featureErrorResponse: () => null }))
mock.module('@/lib/deduct-stock', () => ({ deductStock: async () => {} }))
mock.module('@/lib/tenantTime', () => ({ getTenantTimezone: async () => 'UTC', localDateStrToUtcBounds: () => new Date() }))

async function post(body: any) {
  const { POST } = await import('@/app/api/sales/route')
  const res = await POST(new Request('http://x/api/sales', { method: 'POST', body: JSON.stringify(body) }) as any)
  return { status: res.status, json: await res.json() }
}
beforeEach(() => { state.sales = []; state.cash = []; state.customerBalance = 0; state.role = 'ADMIN'; state.maxPct = 100; state.pinHash = null; state.failCount = 0; state.lockedUntil = null; state.requireShift = false; state.shifts = []; state.cashRows = []; state.returnItem = null; state.stock = []; state.saleUpdates = [] })
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

// ───────────── Phase 3: manager approval ─────────────
// shelf total for `items` = 3×price(product 1) + 2×price(product 2); the fake products have price undefined,
// so give them list prices here to measure the discount against.
function withPrices() { state.prods[0].price = 10; state.prods[1].price = 35 }

test('cashier: discount above the limit → 403 APPROVAL_REQUIRED, nothing is created', async () => {
  withPrices(); state.role = 'EMPLOYEE'; state.maxPct = 5; state.pinHash = 'h:1234'
  const r = await post({ items, discount: { type: 'pct', value: 10 }, payments: [{ method: 'cash', amount: 90 }] })
  expect(r.status).toBe(403)
  expect(r.json.code).toBe('APPROVAL_REQUIRED')
  expect(state.sales).toHaveLength(0)
  expect(state.cash).toHaveLength(0)
})

test('cashier: correct PIN → sale goes through and the invoice records the approval', async () => {
  withPrices(); state.role = 'EMPLOYEE'; state.maxPct = 5; state.pinHash = 'h:1234'
  const r = await post({ items, discount: { type: 'pct', value: 10 }, payments: [{ method: 'cash', amount: 90 }], approvalPin: '1234', note: 'x' })
  expect(r.status).toBe(201)
  expect(state.sales[0].note).toContain('بموافقة المدير')
  expect(state.sales[0].note).toContain('x')
})

test('cashier: wrong PIN is rejected, counted, and 5 wrong tries lock approvals', async () => {
  withPrices(); state.role = 'EMPLOYEE'; state.maxPct = 5; state.pinHash = 'h:1234'
  const body = { items, discount: { type: 'pct', value: 10 }, payments: [{ method: 'cash', amount: 90 }], approvalPin: '0000' }
  const first = await post(body)
  expect(first.status).toBe(403)
  expect(first.json.code).toBe('APPROVAL_INVALID')
  expect(first.json.remaining).toBe(4)
  for (let i = 0; i < 3; i++) await post(body)
  const fifth = await post(body)
  expect(fifth.json.code).toBe('APPROVAL_LOCKED')
  // once locked even the RIGHT pin is refused
  const locked = await post({ ...body, approvalPin: '1234' })
  expect(locked.json.code).toBe('APPROVAL_LOCKED')
  expect(state.sales).toHaveLength(0)
})

test('cashier: a hand-edited price below shelf counts like a discount; shelf price / above is fine', async () => {
  withPrices(); state.role = 'EMPLOYEE'; state.maxPct = 10; state.pinHash = 'h:1234'
  const cheap = [{ productId: 1, quantity: 3, price: 5 }] // shelf 10 → 50% below
  const bad = await post({ items: cheap, payments: [{ method: 'cash', amount: 15 }] })
  expect(bad.status).toBe(403)
  const ok = await post({ items: [{ productId: 1, quantity: 3, price: 12 }], payments: [{ method: 'cash', amount: 36 }] })
  expect(ok.status).toBe(201)
})

test('managers are never asked; and with no limit configured nobody is (old behaviour)', async () => {
  withPrices(); state.pinHash = 'h:1234'
  state.role = 'ADMIN'; state.maxPct = 0
  expect((await post({ items, discount: { type: 'pct', value: 50 }, payments: [{ method: 'cash', amount: 50 }] })).status).toBe(201)
  state.role = 'EMPLOYEE'; state.maxPct = 100
  expect((await post({ items, discount: { type: 'pct', value: 50 }, payments: [{ method: 'cash', amount: 50 }] })).status).toBe(201)
})

test('limit set but no PIN configured: cashier is blocked with a clear reason (not silently allowed)', async () => {
  withPrices(); state.role = 'EMPLOYEE'; state.maxPct = 5; state.pinHash = null
  const r = await post({ items, discount: { type: 'pct', value: 10 }, payments: [{ method: 'cash', amount: 90 }], approvalPin: '1234' })
  expect(r.status).toBe(403)
  expect(r.json.code).toBe('APPROVAL_NO_PIN')
})

// ───────────── generic caller for the other routes ─────────────
async function call(mod: string, method: 'GET' | 'POST' | 'PUT', body?: any, url = 'http://x/api') {
  const m = await import(mod)
  const res = await m[method](new Request(url, { method, body: body ? JSON.stringify(body) : undefined }) as any)
  return { status: res.status, json: await res.json() }
}
const SETTINGS = '@/app/api/pos/settings/route'
const SHIFT = '@/app/api/pos/shift/route'
const RETURNS = '@/app/api/sales/returns/route'

// ───────────── settings ─────────────
test('settings: manager sets limit + PIN; GET exposes hasPin but never the hash; wrong input rejected', async () => {
  const put = await call(SETTINGS, 'PUT', { employeeMaxDiscountPct: 10, pin: '1234', requireShift: true })
  expect(put.status).toBe(200)
  expect(state.maxPct).toBe(10)
  expect(state.requireShift).toBe(true)
  expect(state.pinHash).toBe('h:1234') // stored hashed, not plain
  const get = await call(SETTINGS, 'GET')
  expect(get.json).toMatchObject({ requireShift: true, employeeMaxDiscountPct: 10, hasPin: true })
  expect(JSON.stringify(get.json)).not.toContain('h:1234')
  expect((await call(SETTINGS, 'PUT', { pin: '12' })).status).toBe(400)
  expect((await call(SETTINGS, 'PUT', { employeeMaxDiscountPct: 150 })).status).toBe(400)
})

test('settings: a limit without a PIN returns a warning; clearPin removes it; cashier cannot change anything', async () => {
  const w = await call(SETTINGS, 'PUT', { employeeMaxDiscountPct: 5 })
  expect(w.json.warning).toContain('PIN')
  await call(SETTINGS, 'PUT', { pin: '4321' })
  await call(SETTINGS, 'PUT', { clearPin: true })
  expect(state.pinHash).toBeNull()
  state.role = 'EMPLOYEE'
  expect((await call(SETTINGS, 'PUT', { employeeMaxDiscountPct: 0 })).status).toBe(403)
  expect(state.maxPct).toBe(5) // unchanged
})

// ───────────── shifts ─────────────
test('shift: open is idempotent; close computes expected cash on the SERVER and stores the difference', async () => {
  const a = await call(SHIFT, 'POST', { action: 'open', openingCash: 200 })
  const b = await call(SHIFT, 'POST', { action: 'open', openingCash: 999 })
  expect(a.status).toBe(201)
  expect(b.status).toBe(200)
  expect(state.shifts).toHaveLength(1)
  expect(state.shifts[0].openingCash).toBe(200) // the replay did not overwrite it

  state.cashRows = [
    { source: 'sale', refId: 1, amount: 100, method: 'cash' },
    { source: 'sale', refId: 2, amount: 60, method: null },
    { source: 'sale', refId: 2, amount: 40, method: 'instapay' },
    { source: 'refund', refId: 1, amount: -30, method: 'cash' },
  ]
  const live = await call(SHIFT, 'GET')
  expect(live.json.summary.expectedCash).toBe(330) // 200 + 100 + 60 − 30
  const c = await call(SHIFT, 'POST', { action: 'close', countedCash: 320, expectedCash: 99999 /* client value must be ignored */ })
  expect(c.status).toBe(200)
  expect(state.shifts[0]).toMatchObject({ expectedCash: 330, countedCash: 320, difference: -10 })
  expect(state.shifts[0].closedAt).toBeInstanceOf(Date)
  expect(c.json.summary.otherMethods).toEqual({ instapay: 40 })
  expect((await call(SHIFT, 'POST', { action: 'close', countedCash: 1 })).status).toBe(404) // nothing open any more
})

test('shift: bad amounts rejected; history is managers-only', async () => {
  expect((await call(SHIFT, 'POST', { action: 'open', openingCash: -5 })).status).toBe(400)
  expect((await call(SHIFT, 'POST', { action: 'open', openingCash: 'abc' })).status).toBe(400)
  state.role = 'EMPLOYEE'
  expect((await call(SHIFT, 'GET', undefined, 'http://x/api/pos/shift?history=1')).status).toBe(403)
  state.role = 'ADMIN'
  expect((await call(SHIFT, 'GET', undefined, 'http://x/api/pos/shift?history=1')).status).toBe(200)
})

// ───────────── returns ─────────────
function mkReturnItem() {
  return { id: 9, saleId: 5, productId: 1, quantity: 3, price: 10, variantId: null, variant: null,
    sale: { id: 5, tenantId: 't1', total: 30, paid: 30, customerId: null, invoiceNo: 'INV-1', branchId: null } }
}

test('returns: refund method is recorded on the drawer entry; cannot refund more than the value returned', async () => {
  state.returnItem = mkReturnItem()
  const tooMuch = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -25 }) // value is 10
  expect(tooMuch.status).toBe(400)
  expect(state.cash).toHaveLength(0)
  const ok = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 2, cashDelta: -20, refundMethod: 'instapay' })
  expect(ok.status).toBe(201)
  expect(state.cash[0]).toMatchObject({ source: 'return', amount: -20, method: 'instapay' })
  state.cash.length = 0
  await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10, refundMethod: 'bitcoin' })
  expect(state.cash[0].method).toBeNull() // unknown method never reaches the drawer
})

test('returns: cashier needs the PIN once the shop has one; managers and PIN-less shops are unaffected', async () => {
  state.returnItem = mkReturnItem()
  state.role = 'EMPLOYEE'
  const noPin = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10 })
  expect(noPin.status).toBe(201) // shop has no PIN → old behaviour
  state.pinHash = 'h:1234'
  const need = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10 })
  expect(need.status).toBe(403)
  expect(need.json.code).toBe('APPROVAL_REQUIRED')
  const wrong = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10, approvalPin: '0000' })
  expect(wrong.json.code).toBe('APPROVAL_INVALID')
  const good = await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10, approvalPin: '1234' })
  expect(good.status).toBe(201)
  state.role = 'ADMIN'
  expect((await call(RETURNS, 'POST', { saleItemId: 9, quantity: 1, cashDelta: -10 })).status).toBe(201)
})
