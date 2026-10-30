/**
 * 🛡️ 2026-09-15 (v1): Unified commission calculation helper.
 *
 * Before this, commission was computed in two different routes with two
 * DIFFERENT conventions:
 *   - finance/route.ts:   commission = +amount  (drawer increase)
 *   - payments/route.ts:   commission = -amount  (drawer decrease)
 * This inconsistency caused accounting errors when Vodafone Cash / Instapay
 * / Fawry transactions were recorded via different endpoints.
 *
 * The CORRECT accounting convention:
 *   - The shop EARNS the commission from Vodafone/Instapay/Fawry
 *     (it's a service fee the shop charges customers for wallet services)
 *   - The customer pays: `amount + commission`
 *   - The drawer receives: `amount + commission` (full cash in)
 *   - But the commission portion is REVENUE, not the principal
 *
 * 🛡️ 2026-09-30: commission is charged ONLY on the wallet-agent module
 * (finance/route.ts — customers doing deposit/withdraw at the shop's desk).
 * NO commission on customer payments, and DEFINITELY none on supplier
 * payments — paying a supplier from the shop's wallet is money going OUT,
 * not a fee the shop earns (was wrongly implied by the old docblock here).
 *
 * This helper centralizes the logic so all routes compute + record it
 * consistently. The `recordCommission` function:
 *   1. Computes commission = amount × (rate / 100), rounded to 2 decimals
 *   2. Creates a separate CashEntry with source='commission' for the
 *      commission amount (always positive — it's revenue)
 *   3. Returns the commission amount so the caller can use it for the
 *      net cash entry
 *
 * Usage:
 *   const { commission, netAmount } = await recordCommission(tx, {
 *     tenantId, userId, method, amount, refType, refId, note
 *   })
 *   // Then create the principal cash entry with `netAmount`
 *
 * `method` should be one of: 'vodafone_cash' | 'instapay' | 'fawry' | 'cash' | 'card' | ...
 * For 'cash' / 'card' / unknown methods → no commission, returns commission=0.
 */

import { Prisma } from '@prisma/client'
import { PrismaClient } from './prisma-wasm'

export type PaymentMethod =
  | 'cash'
  | 'vodafone_cash'
  | 'instapay'
  | 'fawry'
  | 'card'
  | 'bank'
  | string

export interface CommissionInput {
  tenantId: string
  userId?: string | null
  method: PaymentMethod
  /** The principal amount (e.g. customer payment amount, supplier payment amount) */
  amount: number
  /** Type of the referencing record: 'sale' | 'payment' | 'purchase' | 'finance' */
  refType: string
  /** ID of the referencing record */
  refId?: number | null
  /** Optional note suffix (e.g. customer name) */
  noteSuffix?: string
}

export interface CommissionResult {
  /** Commission earned (always >= 0). 0 if method is cash/card. */
  commission: number
  /** Net amount to be recorded as the principal cash entry.
   *  For incoming wallet transactions (finance module): amount + commission
   *  But the caller is responsible for the direction — we just return
   *  the commission so the caller can compute the net.
   */
  commissionEntryId?: number
}

/**
 * Get the commission rate (%) for a payment method.
 * Reads from the Tenant table (commissionVodafoneCash, commissionInstapay, commissionFawry).
 * For 'cash' / 'card' / unknown → 0%.
 */
export async function getCommissionRate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  method: PaymentMethod,
): Promise<number> {
  // Normalize method to lowercase for matching
  const m = method.toLowerCase().trim()

  // cash / card / bank → no commission
  if (m === 'cash' || m === 'card' || m === 'bank' || m === 'نقدي' || m === 'كاش') {
    return 0
  }

  // Read tenant commission rates
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
    },
  })
  if (!tenant) return 0

  // Match common variants
  if (m === 'vodafone_cash' || m === 'vodafone' || m === 'vf' || m === 'فودافون' || m === 'فودافون كاش') {
    return tenant.commissionVodafoneCash ?? 0
  }
  if (m === 'instapay' || m === 'insta' || m === 'إنستاباي' || m === 'انستاباي') {
    return tenant.commissionInstapay ?? 0
  }
  if (m === 'fawry' || m === 'fawrey' || m === 'فوري' || m === 'فورى') {
    return tenant.commissionFawry ?? 0
  }
  return 0
}

/**
 * Compute commission amount (does NOT record to DB).
 *   commission = round(amount × rate / 100, 2)
 *
 * Returns 0 if rate is 0 or amount is 0/negative.
 */
export function computeCommission(amount: number, rate: number): number {
  if (!amount || amount <= 0 || !rate || rate <= 0) return 0
  // Round to 2 decimals to avoid float precision issues
  return Math.round(amount * rate) / 100
}

/**
 * Record a commission CashEntry for a payment. Returns the commission amount
 * and the ID of the created CashEntry.
 *
 * The CashEntry has:
 *   source: 'commission'
 *   amount: +commission (always positive — it's revenue)
 *   method: <input.method> (so the drawer aggregation per-method includes
 *     the commission under the right payment method bucket)
 *   refType: <passed in>
 *   refId: <passed in>
 *
 * The caller is responsible for creating the PRINCIPAL cash entry
 * (e.g., the customer payment amount, the supplier payment amount).
 */
export async function recordCommission(
  tx: Prisma.TransactionClient,
  input: CommissionInput,
): Promise<CommissionResult> {
  const rate = await getCommissionRate(tx, input.tenantId, input.method)
  const commission = computeCommission(input.amount, rate)

  if (commission === 0) {
    return { commission: 0 }
  }

  // Create the commission revenue entry (always positive)
  const entry = await tx.cashEntry.create({
    data: {
      tenantId: input.tenantId,
      source: 'commission',
      refId: input.refId ?? null,
      amount: commission,
      method: input.method,
      note: `عمولة ${input.method} — ${input.refType}${input.refId ? ` #${input.refId}` : ''}${input.noteSuffix ? ` — ${input.noteSuffix}` : ''}`,
      userId: input.userId ?? null,
    },
  })

  return {
    commission,
    commissionEntryId: entry.id,
  }
}

/**
 * 🛡️ 2026-09-15 (v3): Helper to create a "principal" cash entry with a
 * method column. Use this for all incoming/outgoing cash flows that are
 * tied to a payment method (cash, vodafone_cash, instapay, fawry).
 *
 * For non-method-tied entries (e.g., manual adjustments), set method=null.
 *
 * The `amount` is signed: positive = money INTO the drawer (customer
 * payment), negative = money OUT of the drawer (supplier payment, expense).
 */
export async function createPrincipalCashEntry(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    userId?: string | null
    method?: PaymentMethod | null
    source: string
    refId?: number | null
    amount: number
    note?: string | null
    /** 🏬 فرع القيد صراحةً (اختياري). لو مفيش، الـ trigger بيحدده من المصدر أو من فرع المستخدم. */
    branchId?: number | null
  },
): Promise<{ id: number }> {
  const entry = await tx.cashEntry.create({
    data: {
      tenantId: input.tenantId,
      source: input.source,
      refId: input.refId ?? null,
      amount: input.amount,
      method: input.method ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    },
    select: { id: true },
  })
  return entry
}
