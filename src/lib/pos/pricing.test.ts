import { describe, expect, test } from 'bun:test'
import { allocateRefund, computeDiscount, discountScale, quickCashAmounts, resolveTender, validatePayments, type TenderState } from './pricing'

const base: TenderState = { split: false, paidFull: true, payMethod: 'cash', cashGiven: 0, paidAmount: 0, splitAmounts: {} }

describe('computeDiscount', () => {
  test('pct and amount', () => {
    expect(computeDiscount(200, { type: 'pct', value: 10 })).toEqual({ ok: true, amount: 20 })
    expect(computeDiscount(200, { type: 'amount', value: 15.5 })).toEqual({ ok: true, amount: 15.5 })
    expect(computeDiscount(200, null)).toEqual({ ok: true, amount: 0 })
    expect(computeDiscount(200, { type: 'pct', value: 0 })).toEqual({ ok: true, amount: 0 })
  })
  test('rejects nonsense', () => {
    expect(computeDiscount(200, { type: 'pct', value: 100 }).ok).toBe(false)
    expect(computeDiscount(200, { type: 'amount', value: 200 }).ok).toBe(false)
    expect(computeDiscount(200, { type: 'amount', value: 250 }).ok).toBe(false)
    expect(computeDiscount(200, { type: 'amount', value: -5 }).ok).toBe(false)
    expect(computeDiscount(0, { type: 'pct', value: 10 }).ok).toBe(false)
    expect(computeDiscount(200, { type: 'x' as any, value: 5 }).ok).toBe(false)
  })
  test('scale keeps Σ(price×qty) equal to the discounted total', () => {
    const items = [{ price: 10, qty: 3 }, { price: 7.5, qty: 2 }] // subtotal 45
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
    const d = computeDiscount(subtotal, { type: 'pct', value: 10 })
    if (!d.ok) throw new Error()
    const k = discountScale(subtotal, d.amount)
    const sum = items.reduce((s, i) => s + i.price * k * i.qty, 0)
    expect(Math.abs(sum - (subtotal - d.amount))).toBeLessThan(1e-9)
    expect(discountScale(100, 0)).toBe(1)
  })
})

describe('validatePayments', () => {
  test('accepts valid, drops zero rows, sums', () => {
    const r = validatePayments([{ method: 'cash', amount: 50 }, { method: 'instapay', amount: 30 }, { method: 'card', amount: 0 }], 100)
    expect(r).toEqual({ ok: true, paid: 80, payments: [{ method: 'cash', amount: 50 }, { method: 'instapay', amount: 30 }] })
  })
  test('rejects unknown method, negative, non-array and overpay', () => {
    expect(validatePayments([{ method: 'bitcoin', amount: 5 }], 100).ok).toBe(false)
    expect(validatePayments([{ method: 'cash', amount: -5 }], 100).ok).toBe(false)
    expect(validatePayments('x', 100).ok).toBe(false)
    expect(validatePayments([{ method: 'cash', amount: 101 }], 100).ok).toBe(false)
    expect(validatePayments([], 100)).toEqual({ ok: true, paid: 0, payments: [] })
  })
})

describe('resolveTender', () => {
  test('exact cash', () => {
    expect(resolveTender(110, base)).toMatchObject({ paid: 110, change: 0, credit: 0, error: null, payments: [{ method: 'cash', amount: 110 }] })
  })
  test('cash over-tendered → change, applied never exceeds total', () => {
    const r = resolveTender(110, { ...base, cashGiven: 200 })
    expect(r.payments).toEqual([{ method: 'cash', amount: 110 }])
    expect(r.change).toBe(90)
    expect(r.paid).toBe(110)
  })
  test('cash given below total blocks', () => {
    expect(resolveTender(110, { ...base, cashGiven: 100 }).error).toBe('المبلغ المستلم أقل من الإجمالي')
  })
  test('non-cash full payment uses exactly the total', () => {
    expect(resolveTender(110, { ...base, payMethod: 'instapay', cashGiven: 500 }).payments).toEqual([{ method: 'instapay', amount: 110 }])
  })
  test('partial → credit', () => {
    const r = resolveTender(110, { ...base, paidFull: false, paidAmount: 40 })
    expect(r).toMatchObject({ paid: 40, credit: 70, change: 0, error: null })
    expect(resolveTender(110, { ...base, paidFull: false, paidAmount: 0 })).toMatchObject({ paid: 0, credit: 110, payments: [] })
  })
  test('split: wallet + cash, cash change only from cash', () => {
    const r = resolveTender(100, { ...base, split: true, splitAmounts: { instapay: 60, cash: 50 } })
    expect(r.payments).toEqual([{ method: 'instapay', amount: 60 }, { method: 'cash', amount: 40 }])
    expect(r.change).toBe(10)
    expect(r.paid).toBe(100)
    expect(r.credit).toBe(0)
  })
  test('split: non-cash above what is owed is an error and is capped', () => {
    const r = resolveTender(100, { ...base, split: true, splitAmounts: { card: 130 } })
    expect(r.error).toContain('أكبر من المتبقي')
    expect(r.paid).toBe(100)
  })
  test('split short → credit', () => {
    expect(resolveTender(100, { ...base, split: true, splitAmounts: { cash: 30, card: 20 } })).toMatchObject({ paid: 50, credit: 50 })
  })
  test('float noise does not create phantom credit', () => {
    const total = 0.1 + 0.2
    expect(resolveTender(total, base).credit).toBe(0)
  })
})

describe('quickCashAmounts', () => {
  test('next notes above the total', () => {
    expect(quickCashAmounts(110)).toEqual([120, 150, 200])
    expect(quickCashAmounts(100)).toEqual([110, 120, 150, 200]) // strictly above; exact is its own button
    expect(quickCashAmounts(0)).toEqual([])
  })
})

describe('quickCashAmounts extra', () => {
  test('odd totals round up to real notes', () => {
    expect(quickCashAmounts(87)).toEqual([90, 100, 200])
    expect(quickCashAmounts(37.5)).toEqual([40, 50, 100, 200])
  })
})

describe('allocateRefund', () => {
  test('no returns since sale → mirrors the original tenders exactly', () => {
    const r = allocateRefund([{ method: 'cash', amount: 60 }, { method: 'instapay', amount: 40 }], 100)
    expect(r).toEqual([{ method: 'cash', amount: 60 }, { method: 'instapay', amount: 40 }])
  })
  test('after a partial return the refund shrinks proportionally and still sums exactly', () => {
    const r = allocateRefund([{ method: 'cash', amount: 60 }, { method: 'instapay', amount: 40 }], 50)
    expect(r).toEqual([{ method: 'cash', amount: 30 }, { method: 'instapay', amount: 20 }].map((x) => x)) // 30 + 20 = 50
    const odd = allocateRefund([{ method: 'cash', amount: 1 }, { method: 'card', amount: 1 }, { method: 'instapay', amount: 1 }], 1)
    expect(Math.round(odd.reduce((s, x) => s + x.amount, 0) * 100) / 100).toBe(1)
  })
  test('legacy sale (single entry without method) → one entry without method', () => {
    expect(allocateRefund([{ method: null, amount: 80 }], 80)).toEqual([{ method: null, amount: 80 }])
  })
  test('nothing paid → nothing to refund; no original entries → single null-method slice', () => {
    expect(allocateRefund([{ method: 'cash', amount: 10 }], 0)).toEqual([])
    expect(allocateRefund([], 25)).toEqual([{ method: null, amount: 25 }])
  })
})

describe('server pipeline invariant: discount folded into item prices', () => {
  test('Σ(item.price × pieces) equals subtotal − discount (so returns/profit stay right)', () => {
    const items = [{ price: 10 / 1, pieces: 3 }, { price: 120 / 12, pieces: 24 }, { price: 7.5, pieces: 2 }]
    const subtotal = items.reduce((s, i) => s + i.price * i.pieces, 0) // 30 + 240 + 15 = 285
    const d = computeDiscount(subtotal, { type: 'pct', value: 12.5 })
    if (!d.ok) throw new Error()
    const k = discountScale(subtotal, d.amount)
    const sum = items.reduce((s, i) => s + i.price * k * i.pieces, 0)
    expect(Math.abs(sum - (subtotal - d.amount))).toBeLessThan(1e-9)
  })
})

import { approvalNeeded, effectiveDiscountPct, isValidPin, listPricePerPiece, summarizeShift, shiftDifference, validateReturnCash } from './pricing'

describe('listPricePerPiece / effectiveDiscountPct / approvalNeeded', () => {
  test('piece uses dynamic retail price when enabled, else flat; units use own price ÷ factor', () => {
    expect(listPricePerPiece({ price: 10 }, null)).toBe(10)
    expect(listPricePerPiece({ price: 10, dynamicRetail: 14 }, null)).toBe(14)
    expect(listPricePerPiece({ price: 10, dynamicRetail: 14 }, { price: 120, factor: 12 })).toBe(10)
    expect(listPricePerPiece({ price: 10, dynamicRetail: 14 }, { price: null, factor: 12 })).toBe(10) // unpriced unit → flat, never dynamic
  })
  test('percent below shelf', () => {
    expect(effectiveDiscountPct(200, 180)).toBeCloseTo(10)
    expect(effectiveDiscountPct(200, 220)).toBeLessThan(0) // sold above shelf = fine
    expect(effectiveDiscountPct(0, 50)).toBe(0)
  })
  test('cashier over the limit needs approval; at the limit / managers / limit=100 do not', () => {
    const base = { listTotal: 200, netTotal: 180 } // 10%
    expect(approvalNeeded({ ...base, role: 'EMPLOYEE', maxPct: 5 }).needed).toBe(true)
    expect(approvalNeeded({ ...base, role: 'EMPLOYEE', maxPct: 10 }).needed).toBe(false)
    expect(approvalNeeded({ ...base, role: 'ADMIN', maxPct: 0 }).needed).toBe(false)
    expect(approvalNeeded({ ...base, role: 'EMPLOYEE', maxPct: 100 }).needed).toBe(false)
  })
  test('a price edited below shelf counts even with no invoice discount', () => {
    // list 10×3=30, cashier typed 7 per piece → net 21 → 30%
    expect(approvalNeeded({ role: 'EMPLOYEE', maxPct: 10, listTotal: 30, netTotal: 21 }).needed).toBe(true)
  })
  test('PIN format', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isValidPin(1234)).toBe(false)
  })
})

describe('summarizeShift', () => {
  const entries = [
    { source: 'sale', refId: 1, amount: 100, method: 'cash' },
    { source: 'sale', refId: 2, amount: 60, method: null }, // legacy = cash
    { source: 'sale', refId: 2, amount: 40, method: 'instapay' },
    { source: 'refund', refId: 1, amount: -30, method: 'cash' },
    { source: 'expense', refId: null, amount: -20, method: null },
    { source: 'sale', refId: 3, amount: 50, method: 'card' },
  ]
  test('expected cash = opening + cash movement; other methods reported separately', () => {
    const s = summarizeShift(200, entries)
    expect(s.cashMovement).toBe(110) // 100 + 60 − 30 − 20
    expect(s.expectedCash).toBe(310)
    expect(s.otherMethods).toEqual({ instapay: 40, card: 50 })
    expect(s.salesCount).toBe(3)
    expect(s.salesCollected).toBe(250)
  })
  test('empty shift', () => {
    expect(summarizeShift(150, [])).toMatchObject({ expectedCash: 150, salesCount: 0, otherMethods: {} })
  })
  test('difference sign: shortage is negative', () => {
    expect(shiftDifference(300, 310)).toBe(-10)
    expect(shiftDifference(315.5, 310)).toBe(5.5)
  })
})

describe('validateReturnCash', () => {
  test('cannot refund more than returned; cannot collect more than the exchange', () => {
    expect(validateReturnCash(-50, 50, 0)).toBeNull()
    expect(validateReturnCash(-60, 50, 0)).not.toBeNull()
    expect(validateReturnCash(20, 50, 70)).toBeNull() // exchange costs 70, return worth 50 → customer pays 20
    expect(validateReturnCash(30, 50, 70)).toBeNull()
    expect(validateReturnCash(80, 50, 70)).not.toBeNull()
    expect(validateReturnCash(0, 50, 0)).toBeNull() // credit return: no cash moves
  })
})
