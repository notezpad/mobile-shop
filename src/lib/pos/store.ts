'use client'

/**
 * usePosStore — single source of truth for the in-progress POS ticket.
 *
 * - Replaces the ~20 useState hooks that lived in POSView.
 * - Cart math is delegated to ./totals (pure + unit-tested).
 * - Draft is persisted to **sessionStorage** (per tab): a refresh keeps the
 *   cart, closing the tab drops it — so stale prices/stock never outlive a
 *   session and nothing leaks between shops sharing a browser.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  addLine,
  removeLine,
  setLinePrice,
  setLineQty,
  setLineUnit,
  setLineVariant,
  type AddLineInput,
} from './totals'
import type { DiscountInput, PayMethod } from './pricing'
import type { CartLine, PosUnit, PosVariant } from './types'

/** Idempotency key: one per ticket, so a retried/replayed checkout can never create a second invoice. */
export function newClientRef(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

export type PayMode = 'full' | 'partial' | 'split'

interface PosState {
  lines: CartLine[]
  selectedCustomerId: number | null
  customerName: string
  customerPhone: string
  paidFull: boolean
  paidAmount: number
  discount: DiscountInput | null
  note: string
  payMethod: PayMethod
  split: boolean
  splitAmounts: Partial<Record<PayMethod, number>>
  /** Cash handed over by the customer (0 = exact). */
  cashGiven: number
  clientRef: string

  /** Returns false when the item was rejected (out of stock). */
  addLine: (input: AddLineInput) => boolean
  setQty: (cartKey: string, qty: number) => void
  setPrice: (cartKey: string, price: number) => void
  removeLine: (cartKey: string) => void
  setUnit: (cartKey: string, unit: PosUnit | null) => void
  setVariant: (cartKey: string, variant: PosVariant | null) => void

  setCustomer: (c: { id?: number | null; name?: string; phone?: string }) => void
  setPaidFull: (v: boolean, total: number) => void
  setPaidAmount: (n: number) => void
  setPayMode: (mode: PayMode, total: number) => void
  setPayMethod: (m: PayMethod) => void
  setSplitAmount: (m: PayMethod, n: number) => void
  setCashGiven: (n: number) => void
  setDiscount: (d: DiscountInput | null) => void
  setNote: (n: string) => void
  /** Replace the whole ticket (used when resuming a held ticket). */
  load: (t: Partial<Omit<TicketSnapshot, 'clientRef'>>) => void
  /** Clear the ticket after a completed sale. */
  reset: () => void
}

const emptyTicket = () => ({
  lines: [] as CartLine[],
  selectedCustomerId: null as number | null,
  customerName: '',
  customerPhone: '',
  paidFull: true,
  paidAmount: 0,
  discount: null as DiscountInput | null,
  note: '',
  payMethod: 'cash' as PayMethod,
  split: false,
  splitAmounts: {} as Partial<Record<PayMethod, number>>,
  cashGiven: 0,
  clientRef: newClientRef(),
})

export type TicketSnapshot = ReturnType<typeof emptyTicket>

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      ...emptyTicket(),

      addLine: (input) => {
        const r = addLine(get().lines, input)
        if (r.ok) set({ lines: r.lines })
        return r.ok
      },
      setQty: (k, q) => set((s) => ({ lines: setLineQty(s.lines, k, q) })),
      setPrice: (k, p) => set((s) => ({ lines: setLinePrice(s.lines, k, p) })),
      removeLine: (k) => set((s) => ({ lines: removeLine(s.lines, k) })),
      setUnit: (k, u) => set((s) => ({ lines: setLineUnit(s.lines, k, u) })),
      setVariant: (k, v) => set((s) => ({ lines: setLineVariant(s.lines, k, v) })),

      setCustomer: (c) =>
        set((s) => ({
          selectedCustomerId: c.id !== undefined ? c.id : s.selectedCustomerId,
          customerName: c.name !== undefined ? c.name : s.customerName,
          customerPhone: c.phone !== undefined ? c.phone : s.customerPhone,
        })),
      // Same behaviour as the legacy checkbox: on → 0, off → prefill with total.
      setPaidFull: (v, total) => set({ paidFull: v, paidAmount: v ? 0 : total }),
      setPaidAmount: (n) => set({ paidAmount: n }),
      setPayMode: (mode, total) =>
        set({
          split: mode === 'split',
          paidFull: mode !== 'partial',
          paidAmount: mode === 'partial' ? total : 0,
          splitAmounts: {},
          cashGiven: 0,
        }),
      setPayMethod: (m) => set({ payMethod: m, cashGiven: 0 }),
      setSplitAmount: (m, n) => set((s) => ({ splitAmounts: { ...s.splitAmounts, [m]: n } })),
      setCashGiven: (n) => set({ cashGiven: n }),
      setDiscount: (d) => set({ discount: d && d.value > 0 ? d : null, cashGiven: 0 }),
      setNote: (n) => set({ note: n }),
      load: (t) => set({ ...emptyTicket(), ...t }),
      reset: () => set({ ...emptyTicket() }),
    }),
    {
      name: 'pos-draft-v1',
      version: 2,
      // v1 drafts (before discount/payments existed) are dropped rather than migrated — a draft is disposable.
      migrate: () => ({ ...emptyTicket() }) as any,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        lines: s.lines,
        selectedCustomerId: s.selectedCustomerId,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        paidFull: s.paidFull,
        paidAmount: s.paidAmount,
        discount: s.discount,
        note: s.note,
        payMethod: s.payMethod,
        split: s.split,
        splitAmounts: s.splitAmounts,
        cashGiven: s.cashGiven,
        clientRef: s.clientRef,
      }),
    },
  ),
)
