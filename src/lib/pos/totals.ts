/**
 * POS pure logic — cart operations + totals.
 *
 * Every function here is pure (no React, no I/O, no toast) so the numbers on
 * screen, on the receipt and sent to the server come from ONE place and can be
 * unit-tested. Behaviour is a 1:1 port of the legacy POSView logic.
 */
import { computeDiscount, listPricePerPiece, round2, type DiscountInput } from './pricing'
import type {
  CartLine,
  PosUnit,
  PosVariant,
  ProductLite,
  SaleItemPayload,
} from './types'

/** Price for the "Piece / قطعة" unit: dynamic retail price if enabled, else flat price. */
export function piecePrice(product: ProductLite): number {
  return product.dynamicRetailPrice ?? product.price
}

export function variantLabelOf(v: PosVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

export function makeCartKey(
  productId: number,
  unitId: number | null,
  variantId: number | null,
): string {
  return `${productId}-${unitId ?? 'x'}-${variantId ?? 'x'}`
}

/** Per-piece price for a product+unit. Unpriced wholesale unit → raw flat price (never the dynamic one). */
export function perPiecePriceFor(product: ProductLite, unit: PosUnit | null): number {
  if (!unit) return piecePrice(product)
  const factor = unit.factor || 1
  return unit.price != null ? unit.price / factor : product.price
}

function stockCeiling(baseStock: number, factor: number): number {
  return factor > 1 ? Math.floor(baseStock / factor) * factor : baseStock
}

export interface AddLineInput {
  product: ProductLite
  unitId: number | null
  unitLabel: string | null
  maxQuantity: number
  availableUnits: PosUnit[]
  variantId?: number | null
  variantLabel?: string | null
  availableVariants?: PosVariant[]
}

export type AddLineResult =
  | { ok: true; lines: CartLine[] }
  | { ok: false; reason: 'out_of_stock'; lines: CartLine[] }

/** Add a product (or bump its quantity by one unit if the line already exists). */
export function addLine(lines: CartLine[], input: AddLineInput): AddLineResult {
  const variantId = input.variantId ?? null
  const cartKey = makeCartKey(input.product.id, input.unitId, variantId)
  const unit = input.unitId ? input.availableUnits.find((u) => u.id === input.unitId) ?? null : null
  const factor = unit?.factor ?? 1

  const existing = lines.find((l) => l.cartKey === cartKey)
  if (existing) {
    return {
      ok: true,
      lines: lines.map((l) =>
        l.cartKey === cartKey
          ? { ...l, quantity: Math.min(l.quantity + factor, l.maxQuantity) }
          : l,
      ),
    }
  }
  if (input.maxQuantity <= 0) return { ok: false, reason: 'out_of_stock', lines }

  const line: CartLine = {
    cartKey,
    product: input.product,
    price: perPiecePriceFor(input.product, unit),
    quantity: Math.min(factor, input.maxQuantity),
    maxQuantity: input.maxQuantity,
    unitId: input.unitId,
    unitLabel: input.unitLabel,
    unitFactor: factor,
    availableUnits: input.availableUnits,
    variantId,
    variantLabel: input.variantLabel ?? null,
    availableVariants: input.availableVariants ?? [],
  }
  return { ok: true, lines: [...lines, line] }
}

/** Quantity is in pieces but stays a multiple of the unit factor and within [factor, maxQuantity]. */
export function setLineQty(lines: CartLine[], cartKey: string, q: number): CartLine[] {
  return lines.map((l) => {
    if (l.cartKey !== cartKey) return l
    const factor = l.unitFactor ?? 1
    const rounded = factor > 1 ? Math.round(q / factor) * factor : q
    return { ...l, quantity: Math.max(factor, Math.min(rounded, l.maxQuantity)) }
  })
}

export function setLinePrice(lines: CartLine[], cartKey: string, p: number): CartLine[] {
  return lines.map((l) => (l.cartKey === cartKey ? { ...l, price: Math.max(0, p) } : l))
}

export function removeLine(lines: CartLine[], cartKey: string): CartLine[] {
  return lines.filter((l) => l.cartKey !== cartKey)
}

export function setLineUnit(lines: CartLine[], cartKey: string, unit: PosUnit | null): CartLine[] {
  return lines.map((l) => {
    if (l.cartKey !== cartKey) return l
    const factor = unit?.factor ?? 1
    const baseStock = l.variantId
      ? l.availableVariants.find((v) => v.id === l.variantId)?.quantity ?? 0
      : l.product.quantity
    const newMax = unit?.factor ? Math.floor(baseStock / unit.factor) * unit.factor : baseStock
    return {
      ...l,
      cartKey: makeCartKey(l.product.id, unit?.id ?? null, l.variantId),
      unitId: unit?.id ?? null,
      unitLabel: unit?.name ?? null,
      unitFactor: factor,
      price: perPiecePriceFor(l.product, unit),
      quantity: Math.min(factor, newMax),
      maxQuantity: newMax,
    }
  })
}

export function setLineVariant(
  lines: CartLine[],
  cartKey: string,
  variant: PosVariant | null,
): CartLine[] {
  return lines.map((l) => {
    if (l.cartKey !== cartKey) return l
    const baseStock = variant ? variant.quantity : l.product.quantity
    const newMax = stockCeiling(baseStock, l.unitFactor)
    return {
      ...l,
      cartKey: makeCartKey(l.product.id, l.unitId, variant?.id ?? null),
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantLabelOf(variant) : null,
      quantity: Math.min(l.unitFactor, newMax),
      maxQuantity: newMax,
    }
  })
}

export interface Totals {
  itemCount: number // number of cart lines (legacy "عدد الأصناف")
  total: number
}

export function selectTotals(lines: CartLine[]): Totals {
  return {
    itemCount: lines.length,
    total: lines.reduce((s, l) => s + l.price * l.quantity, 0),
  }
}

/** Amount actually paid: full total, or the entered amount when "سداد كامل" is off. */
export function paidAmountFor(total: number, paidFull: boolean, paidAmount: number): number {
  return paidFull ? total : paidAmount
}

/** Convert cart lines into the payload POST /api/sales expects (per-unit qty/price when a unit is used). */
export function toSaleItems(lines: CartLine[]): SaleItemPayload[] {
  return lines.map((l) => {
    const factor = l.unitFactor || 1
    const unitsEntered = l.unitId ? Math.round(l.quantity / factor) : l.quantity
    const pricePerEntered = l.unitId ? l.price * factor : l.price
    return {
      productId: l.product.id,
      quantity: unitsEntered,
      price: pricePerEntered,
      ...(l.unitId ? { unitId: l.unitId } : {}),
      ...(l.variantId ? { variantId: l.variantId } : {}),
    }
  })
}

/** Price shown/edited for a line: per selected unit (e.g. per دستة) or per piece. */
export function displayUnitPrice(line: Pick<CartLine, 'price' | 'unitId' | 'unitFactor'>): number {
  return line.unitId ? line.price * (line.unitFactor || 1) : line.price
}

/** How many units (or pieces) the cashier sees in the stepper. */
export function displayQty(line: Pick<CartLine, 'quantity' | 'unitId' | 'unitFactor'>): number {
  return line.unitId ? Math.round(line.quantity / (line.unitFactor || 1)) : line.quantity
}

export interface Payable {
  subtotal: number
  discountAmount: number
  /** What the customer owes: subtotal − discount (same rounding rule as the server). */
  total: number
  /** Blocking discount problem to show in the UI, or null. */
  discountError: string | null
}

/** Single source for "how much is this invoice" — screen, payment logic and payload all use it. */
export function selectPayable(lines: CartLine[], discount: DiscountInput | null): Payable {
  const { total: subtotal } = selectTotals(lines)
  const d = computeDiscount(subtotal, discount)
  if (!d.ok) return { subtotal, discountAmount: 0, total: subtotal, discountError: d.error }
  return {
    subtotal,
    discountAmount: d.amount,
    total: d.amount > 0 ? round2(subtotal - d.amount) : subtotal,
    discountError: null,
  }
}

/** Shelf-price total of the ticket (see listPricePerPiece) — the baseline the discount limit is measured against. */
export function listTotalOfLines(lines: CartLine[]): number {
  return lines.reduce((s, l) => {
    const unit = l.unitId ? l.availableUnits.find((u) => u.id === l.unitId) ?? null : null
    return s + listPricePerPiece({ price: l.product.price, dynamicRetail: l.product.dynamicRetailPrice }, unit) * l.quantity
  }, 0)
}
