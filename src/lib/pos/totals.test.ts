import { describe, expect, test } from 'bun:test'
import {
  addLine,
  displayQty,
  displayUnitPrice,
  paidAmountFor,
  selectTotals,
  setLinePrice,
  setLineQty,
  setLineUnit,
  setLineVariant,
  removeLine,
  toSaleItems,
} from './totals'
import type { CartLine, PosUnit, ProductLite } from './types'

const product: ProductLite = { id: 1, name: 'قميص', barcode: '111', price: 10, quantity: 100 }
const dozen: PosUnit = { id: 7, name: 'دستة', price: 120, factor: 12 }
const quarter: PosUnit = { id: 8, name: 'ربع دستة', price: 30, factor: 3 }

function base(): CartLine[] {
  const r = addLine([], { product, unitId: null, unitLabel: null, maxQuantity: 100, availableUnits: [dozen, quarter] })
  if (!r.ok) throw new Error('setup failed')
  return r.lines
}

describe('addLine', () => {
  test('adds a piece line with flat price', () => {
    const l = base()
    expect(l).toHaveLength(1)
    expect(l[0].price).toBe(10)
    expect(l[0].quantity).toBe(1)
    expect(l[0].cartKey).toBe('1-x-x')
  })
  test('uses dynamic retail price for pieces only', () => {
    const p = { ...product, dynamicRetailPrice: 15 }
    const r = addLine([], { product: p, unitId: null, unitLabel: null, maxQuantity: 100, availableUnits: [dozen] })
    expect(r.ok && r.lines[0].price).toBe(15)
    const w = addLine([], { product: p, unitId: 7, unitLabel: 'دستة', maxQuantity: 100, availableUnits: [{ ...dozen, price: null }] })
    expect(w.ok && w.lines[0].price).toBe(10) // unpriced wholesale → flat price, not dynamic
  })
  test('adding same line again bumps by one unit and respects the ceiling', () => {
    const first = addLine([], { product, unitId: 7, unitLabel: 'دستة', maxQuantity: 24, availableUnits: [dozen] })
    if (!first.ok) throw new Error()
    const second = addLine(first.lines, { product, unitId: 7, unitLabel: 'دستة', maxQuantity: 24, availableUnits: [dozen] })
    const third = addLine(second.lines, { product, unitId: 7, unitLabel: 'دستة', maxQuantity: 24, availableUnits: [dozen] })
    expect(second.lines[0].quantity).toBe(24)
    expect(third.lines[0].quantity).toBe(24)
  })
  test('per-piece price spreads the unit price over the factor', () => {
    const r = addLine([], { product, unitId: 7, unitLabel: 'دستة', maxQuantity: 100, availableUnits: [dozen] })
    expect(r.ok && r.lines[0].price).toBe(10) // 120 / 12
    expect(r.ok && r.lines[0].quantity).toBe(12)
  })
  test('out of stock is rejected without changing the cart', () => {
    const r = addLine([], { product, unitId: null, unitLabel: null, maxQuantity: 0, availableUnits: [] })
    expect(r.ok).toBe(false)
    expect(r.lines).toHaveLength(0)
  })
})

describe('setLineQty', () => {
  test('clamps to [1, max] for pieces', () => {
    const l = base()
    expect(setLineQty(l, '1-x-x', 0)[0].quantity).toBe(1)
    expect(setLineQty(l, '1-x-x', 500)[0].quantity).toBe(100)
    expect(setLineQty(l, '1-x-x', 5)[0].quantity).toBe(5)
  })
  test('rounds to a multiple of the unit factor', () => {
    // real flow: line is added as a piece, then the unit is chosen via setLineUnit
    const lines = setLineUnit(base(), '1-x-x', dozen)
    expect(setLineQty(lines, '1-7-x', 25)[0].quantity).toBe(24)
    expect(setLineQty(lines, '1-7-x', 1)[0].quantity).toBe(12)
    expect(setLineQty(lines, '1-7-x', 999)[0].quantity).toBe(96) // floor(100/12)*12
  })
})

describe('setLineUnit', () => {
  test('switching unit re-keys the line, reprices and resets qty', () => {
    const l = setLineUnit(base(), '1-x-x', dozen)
    expect(l[0].cartKey).toBe('1-7-x')
    expect(l[0].price).toBe(10)
    expect(l[0].quantity).toBe(12)
    expect(l[0].maxQuantity).toBe(96)
    const back = setLineUnit(l, '1-7-x', null)
    expect(back[0].cartKey).toBe('1-x-x')
    expect(back[0].quantity).toBe(1)
    expect(back[0].maxQuantity).toBe(100)
  })
})

describe('setLineVariant', () => {
  test('uses the variant stock as the ceiling', () => {
    const l = setLineVariant(base(), '1-x-x', { id: 5, size: '42', color: 'أسود', quantity: 4 })
    expect(l[0].cartKey).toBe('1-x-5')
    expect(l[0].maxQuantity).toBe(4)
    expect(l[0].variantLabel).toBe('أسود / 42')
  })
})

describe('price / remove / totals / payload', () => {
  test('price never goes negative', () => {
    expect(setLinePrice(base(), '1-x-x', -5)[0].price).toBe(0)
  })
  test('remove line', () => {
    expect(removeLine(base(), '1-x-x')).toHaveLength(0)
  })
  test('selectTotals sums price × pieces', () => {
    let l = base()
    l = setLineQty(l, '1-x-x', 3)
    l = setLinePrice(l, '1-x-x', 12.5)
    expect(selectTotals(l)).toEqual({ itemCount: 1, total: 37.5 })
    expect(selectTotals([])).toEqual({ itemCount: 0, total: 0 })
  })
  test('paidAmountFor', () => {
    expect(paidAmountFor(100, true, 30)).toBe(100)
    expect(paidAmountFor(100, false, 30)).toBe(30)
  })
  test('toSaleItems converts to per-unit qty/price and keeps piece totals', () => {
    const lines = setLineQty(setLineUnit(base(), '1-x-x', dozen), '1-7-x', 24)
    const items = toSaleItems(lines)
    expect(items).toEqual([{ productId: 1, quantity: 2, price: 120, unitId: 7 }])
    // invariant: payload total === on-screen total
    expect(items[0].quantity * items[0].price).toBe(selectTotals(lines).total)
  })
  test('toSaleItems for plain pieces + variant', () => {
    let l = setLineVariant(base(), '1-x-x', { id: 5, size: null, color: 'أحمر', quantity: 9 })
    l = setLineQty(l, '1-x-5', 3)
    expect(toSaleItems(l)).toEqual([{ productId: 1, quantity: 3, price: 10, variantId: 5 }])
  })
})

describe('display helpers (stepper / price shown per selected unit)', () => {
  test('pieces: shown as-is', () => {
    const l = setLineQty(base(), '1-x-x', 5)[0]
    expect(displayQty(l)).toBe(5)
    expect(displayUnitPrice(l)).toBe(10)
  })
  test('unit selected: shown per unit, and round-trips through setLineQty/setLinePrice', () => {
    let lines = setLineUnit(base(), '1-x-x', dozen)
    lines = setLineQty(lines, '1-7-x', 2 * 12) // stepper: 2 دستة
    const l = lines[0]
    expect(displayQty(l)).toBe(2)
    expect(displayUnitPrice(l)).toBe(120)
    const edited = setLinePrice(lines, '1-7-x', 240 / 12)[0] // cashier types 240 per دستة
    expect(edited.price).toBe(20)
    expect(displayUnitPrice(edited)).toBe(240)
    expect(selectTotals([edited]).total).toBe(480)
  })
})

import { selectPayable } from './totals'
describe('selectPayable', () => {
  const lines = () => setLineQty(base(), '1-x-x', 4) // 4 × 10 = 40
  test('no discount → total = subtotal, unrounded like before', () => {
    expect(selectPayable(lines(), null)).toEqual({ subtotal: 40, discountAmount: 0, total: 40, discountError: null })
  })
  test('percent and amount discounts', () => {
    expect(selectPayable(lines(), { type: 'pct', value: 10 })).toMatchObject({ discountAmount: 4, total: 36 })
    expect(selectPayable(lines(), { type: 'amount', value: 5 })).toMatchObject({ discountAmount: 5, total: 35 })
  })
  test('invalid discount is reported, total stays at subtotal', () => {
    const r = selectPayable(lines(), { type: 'amount', value: 40 })
    expect(r.discountError).not.toBeNull()
    expect(r.total).toBe(40)
  })
})
