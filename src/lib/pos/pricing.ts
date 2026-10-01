/**
 * POS pricing rules shared by the SERVER (/api/sales) and the SCREEN, so the
 * total the cashier sees is computed by the exact same code the server trusts.
 * Pure functions only — no React, no I/O.
 *
 * Accounting decision: an invoice discount is spread PROPORTIONALLY into the
 * per-piece item prices at sale time. Profit reports use (item.price - item.cost)
 * and returns refund at item.price, so this keeps every existing report, return
 * and drawer figure correct with zero changes to them. Sale.subtotal / Sale.discount
 * are stored only for display and the receipt.
 */

export const PAY_METHODS = ['cash', 'vodafone_cash', 'instapay', 'card'] as const
export type PayMethod = (typeof PAY_METHODS)[number]

// Same wording the rest of the app uses for these method keys (PaymentDialog etc.).
export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'إنستاباي',
  card: 'كارد',
}

export function isPayMethod(x: unknown): x is PayMethod {
  return typeof x === 'string' && (PAY_METHODS as readonly string[]).includes(x)
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const EPS = 0.005

export interface DiscountInput {
  type: 'pct' | 'amount'
  value: number
}

export type DiscountResult = { ok: true; amount: number } | { ok: false; error: string }

/** Discount in currency. Must leave something to pay: 0 ≤ amount < subtotal (pct: 0 ≤ v < 100). */
export function computeDiscount(subtotal: number, d: DiscountInput | null | undefined): DiscountResult {
  if (!d || !d.value) return { ok: true, amount: 0 }
  const v = Number(d.value)
  if (!Number.isFinite(v) || v < 0) return { ok: false, error: 'قيمة الخصم غير صالحة' }
  if (v === 0) return { ok: true, amount: 0 }
  if (d.type !== 'pct' && d.type !== 'amount') return { ok: false, error: 'نوع الخصم غير صالح' }
  if (subtotal <= 0) return { ok: false, error: 'مفيش إجمالي يتطبق عليه خصم' }
  if (d.type === 'pct' && v >= 100) return { ok: false, error: 'نسبة الخصم لازم تكون أقل من 100%' }
  const amount = d.type === 'pct' ? round2((subtotal * v) / 100) : round2(v)
  if (amount >= subtotal - EPS) return { ok: false, error: 'الخصم لازم يكون أقل من إجمالي الفاتورة' }
  return { ok: true, amount }
}

/** Multiplier applied to every item price so Σ(price×qty) equals the discounted total. */
export function discountScale(subtotal: number, discountAmount: number): number {
  return discountAmount > 0 && subtotal > 0 ? (subtotal - discountAmount) / subtotal : 1
}

export interface Tender {
  method: PayMethod
  amount: number
}

export type PaymentsResult = { ok: true; payments: Tender[]; paid: number } | { ok: false; error: string }

/** Server-side validation of the payments array: known methods, positive amounts, never more than the total. */
export function validatePayments(input: unknown, total: number): PaymentsResult {
  if (!Array.isArray(input)) return { ok: false, error: 'بيانات الدفع غير صالحة' }
  const payments: Tender[] = []
  for (const p of input) {
    const amount = round2(Number((p as any)?.amount))
    if (!isPayMethod((p as any)?.method)) return { ok: false, error: 'طريقة دفع غير صالحة' }
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'مبلغ دفع غير صالح' }
    if (amount === 0) continue
    payments.push({ method: (p as any).method, amount })
  }
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0))
  if (paid > total + EPS) return { ok: false, error: 'المبلغ المدفوع أكبر من إجمالي الفاتورة' }
  return { ok: true, payments, paid }
}

export interface TenderState {
  split: boolean
  paidFull: boolean
  payMethod: PayMethod
  /** Cash handed over by the customer (0 = exact). Only used in single-method full payment with cash. */
  cashGiven: number
  /** Amount for partial payment (single method). */
  paidAmount: number
  splitAmounts: Partial<Record<PayMethod, number>>
}

export interface TenderResult {
  /** What is actually applied to the invoice (never exceeds total). */
  payments: Tender[]
  paid: number
  /** Cash change to hand back (only cash can produce change). */
  change: number
  /** Unpaid part → becomes the customer's credit (آجل). */
  credit: number
  /** Blocking problem to show instead of enabling the pay button, or null. */
  error: string | null
}

/**
 * From the payment UI state + invoice total → the payments to send, the change and the credit.
 * Non-cash tenders can never exceed what is still owed; only cash can be over-tendered (→ change).
 */
export function resolveTender(total: number, s: TenderState): TenderResult {
  let tenders: Tender[]
  if (s.split) {
    tenders = (Object.entries(s.splitAmounts) as [PayMethod, number][])
      .filter(([m, a]) => isPayMethod(m) && a > 0)
      .map(([method, amount]) => ({ method, amount: round2(amount) }))
  } else if (s.paidFull) {
    const given = s.payMethod === 'cash' && s.cashGiven > 0 ? s.cashGiven : total
    tenders = [{ method: s.payMethod, amount: round2(given) }]
  } else {
    tenders = [{ method: s.payMethod, amount: round2(s.paidAmount) }]
  }
  tenders = tenders.filter((t) => t.amount > 0)

  // Apply non-cash first (capped at what's owed), then cash takes the rest; overflow of cash = change.
  let remaining = round2(total)
  const applied: Tender[] = []
  let error: string | null = null
  for (const t of tenders.filter((x) => x.method !== 'cash')) {
    if (t.amount > remaining + EPS) error = `مبلغ ${PAY_METHOD_LABELS[t.method]} أكبر من المتبقي`
    const a = Math.min(t.amount, Math.max(remaining, 0))
    if (a > 0) applied.push({ method: t.method, amount: round2(a) })
    remaining = round2(remaining - a)
  }
  let change = 0
  for (const t of tenders.filter((x) => x.method === 'cash')) {
    const a = Math.min(t.amount, Math.max(remaining, 0))
    if (a > 0) applied.push({ method: 'cash', amount: round2(a) })
    change = round2(change + (t.amount - a))
    remaining = round2(remaining - a)
  }
  const paid = round2(applied.reduce((s, p) => s + p.amount, 0))
  const credit = remaining > EPS ? remaining : 0

  if (!error && s.paidFull && !s.split && s.payMethod === 'cash' && s.cashGiven > 0 && s.cashGiven + EPS < total) {
    error = 'المبلغ المستلم أقل من الإجمالي'
  }
  return { payments: applied, paid, change, credit, error }
}

/**
 * Quick "cash given" buttons: the next round amounts a customer would hand over.
 * For each note size n → the next multiple of n above the total (a multiple that
 * equals the total moves up one note, since "exact" is its own button). Deduped, max 4.
 */
export function quickCashAmounts(total: number): number[] {
  if (total <= 0) return []
  const notes = [10, 20, 50, 100, 200]
  const out = new Set<number>()
  for (const n of notes) {
    let up = Math.ceil((total - EPS) / n) * n
    if (up < total + EPS) up += n
    out.add(round2(up))
  }
  return [...out].sort((a, b) => a - b).slice(0, 4)
}

export interface RefundSlice {
  method: string | null
  amount: number
}

/**
 * Spread the amount that must go back to the customer across the payment methods
 * the sale originally came in through, proportionally (last slice absorbs rounding).
 * Used when a sale is deleted: `refundTotal` is Sale.paid AFTER any partial returns,
 * so it can be less than the original tenders — we must not mirror the originals blindly.
 */
export function allocateRefund(original: RefundSlice[], refundTotal: number): RefundSlice[] {
  const entries = original.filter((e) => e.amount > 0)
  const base = round2(entries.reduce((s, e) => s + e.amount, 0))
  if (refundTotal <= EPS) return []
  if (entries.length === 0 || base <= EPS) return [{ method: null, amount: round2(refundTotal) }]
  const out: RefundSlice[] = []
  let left = round2(refundTotal)
  entries.forEach((e, i) => {
    const isLast = i === entries.length - 1
    const share = isLast ? left : Math.min(left, round2((refundTotal * e.amount) / base))
    if (share > EPS) out.push({ method: e.method, amount: round2(share) })
    left = round2(left - share)
  })
  return out
}

// ───────────────────────── Phase 3: permissions & shifts ─────────────────────────

export const PIN_RE = /^\d{4,8}$/
export const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && PIN_RE.test(pin)

/** Roles that never need approval (the manager IS the approver). */
export const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const

/**
 * The shelf price for one PIECE of a line — what the item "should" sell for before any manual
 * price edit or discount. Mirrors the POS: piece lines use the dynamic retail price when the
 * shop enabled it (else the flat price); wholesale units use their own price (÷ factor), and an
 * unpriced unit falls back to the flat piece price. SAME function on the screen and the server.
 */
export function listPricePerPiece(
  product: { price: number; dynamicRetail?: number | null },
  unit: { price: number | null; factor: number } | null,
): number {
  if (!unit) return product.dynamicRetail ?? product.price
  return unit.price != null ? unit.price / (unit.factor || 1) : product.price
}

/** How far below the shelf price the invoice ends up, in % (negative = above shelf price). */
export function effectiveDiscountPct(listTotal: number, netTotal: number): number {
  if (listTotal <= EPS) return 0
  return ((listTotal - netTotal) / listTotal) * 100
}

export interface ApprovalCheck {
  role: string
  /** Tenant limit for cashiers; ≥100 means "no limit". */
  maxPct: number
  listTotal: number
  netTotal: number
}

/** Does this invoice need the manager's PIN? Managers never do; cashiers do above the limit. */
export function approvalNeeded(c: ApprovalCheck): { needed: boolean; pct: number } {
  const pct = effectiveDiscountPct(c.listTotal, c.netTotal)
  if ((APPROVER_ROLES as readonly string[]).includes(c.role)) return { needed: false, pct }
  if (c.maxPct >= 100) return { needed: false, pct }
  return { needed: pct > c.maxPct + 0.005, pct }
}

export type PinFailure = { ok: false; code: 'APPROVAL_NO_PIN' | 'APPROVAL_LOCKED' | 'APPROVAL_INVALID'; error: string; remaining?: number; lockedUntil?: Date }
export const PIN_MAX_FAILS = 5
export const PIN_LOCK_MS = 15 * 60 * 1000

// ───────────── shift reconciliation ─────────────

export interface ShiftEntry {
  source: string
  refId: number | null
  amount: number
  method: string | null
}

export interface ShiftSummary {
  openingCash: number
  /** Net cash that moved through the drawer in the shift (sales, refunds, expenses… — method cash or legacy null). */
  cashMovement: number
  expectedCash: number
  /** Net per NON-cash method (vodafone_cash, instapay, card…), so the closing report shows all tenders. */
  otherMethods: Record<string, number>
  salesCount: number
  /** Gross money collected on sales (all methods). */
  salesCollected: number
}

/** Pure reconciliation of a shift from the cashier's own drawer entries. */
export function summarizeShift(openingCash: number, entries: ShiftEntry[]): ShiftSummary {
  let cashMovement = 0
  let salesCollected = 0
  const other: Record<string, number> = {}
  const saleRefs = new Set<number>()
  for (const e of entries) {
    const isCash = e.method == null || e.method === 'cash'
    if (isCash) cashMovement += e.amount
    else other[e.method as string] = (other[e.method as string] ?? 0) + e.amount
    if (e.source === 'sale') {
      salesCollected += e.amount
      if (e.refId != null) saleRefs.add(e.refId)
    }
  }
  for (const k of Object.keys(other)) other[k] = round2(other[k])
  return {
    openingCash: round2(openingCash),
    cashMovement: round2(cashMovement),
    expectedCash: round2(openingCash + cashMovement),
    otherMethods: other,
    salesCount: saleRefs.size,
    salesCollected: round2(salesCollected),
  }
}

/** Counted − expected. Negative = shortage. */
export const shiftDifference = (counted: number, expected: number): number => round2(counted - expected)

/** A return may never pay out more than the value returned, nor take more than the exchange charge. */
export function validateReturnCash(cashDelta: number, refundAmount: number, exchangeCharge: number): string | null {
  if (cashDelta < -(refundAmount + 0.005)) return 'مبلغ الرد النقدي أكبر من قيمة المرتجع'
  if (cashDelta > exchangeCharge + 0.005) return 'المبلغ المحصّل أكبر من قيمة الاستبدال'
  return null
}
