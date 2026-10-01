'use client'

/**
 * Held ("معلّقة") tickets — park the current invoice, serve the next customer, resume later.
 * Stored in localStorage (survives a closed tab/shift change), scoped by tenant, max 10, dropped after 24h.
 * 100% local → works offline. Prices/stock are NOT trusted on resume: the server re-validates stock at checkout.
 */
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { useShopStore } from '@/lib/store'
import { usePosStore, type TicketSnapshot } from './store'

export interface HeldTicket {
  id: string
  at: number
  label: string
  ticket: Omit<TicketSnapshot, 'clientRef'>
}

export const MAX_HELD = 10
export const HELD_TTL_MS = 24 * 60 * 60 * 1000

/** Newest first, expired dropped, capped. Pure. */
export function pruneHeld(list: HeldTicket[], now: number): HeldTicket[] {
  return list
    .filter((h) => now - h.at < HELD_TTL_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_HELD)
}

const tenantScopedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(`${name}:${useShopStore.getState().user?.tenantId ?? 'anon'}`),
  setItem: (name, value) => localStorage.setItem(`${name}:${useShopStore.getState().user?.tenantId ?? 'anon'}`, value),
  removeItem: (name) => localStorage.removeItem(`${name}:${useShopStore.getState().user?.tenantId ?? 'anon'}`),
}

interface HeldState {
  held: HeldTicket[]
  add: (h: HeldTicket) => void
  remove: (id: string) => void
  /** Re-read from storage (after login/tenant change). */
  rehydrate: () => void
}

export const useHeldStore = create<HeldState>()(
  persist(
    (set) => ({
      held: [],
      add: (h) => set((s) => ({ held: pruneHeld([h, ...s.held], Date.now()) })),
      remove: (id) => set((s) => ({ held: s.held.filter((x) => x.id !== id) })),
      rehydrate: () => void useHeldStore.persist.rehydrate(),
    }),
    { name: 'pos-held-v1', version: 1, storage: createJSONStorage(() => tenantScopedStorage), partialize: (s) => ({ held: s.held }) },
  ),
)

function snapshotOfCurrent(): { ticket: HeldTicket['ticket']; hasContent: boolean } {
  const { lines, selectedCustomerId, customerName, customerPhone, paidFull, paidAmount, discount, note, payMethod, split, splitAmounts, cashGiven } =
    usePosStore.getState()
  return {
    hasContent: lines.length > 0,
    ticket: { lines, selectedCustomerId, customerName, customerPhone, paidFull, paidAmount, discount, note, payMethod, split, splitAmounts, cashGiven },
  }
}

function toHeld(): HeldTicket | null {
  const { ticket, hasContent } = snapshotOfCurrent()
  if (!hasContent) return null
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, at: Date.now(), label: ticket.customerName.trim() || 'فاتورة', ticket }
}

/** Park the current ticket. Returns false if it was empty. */
export function holdCurrentTicket(): boolean {
  const h = toHeld()
  if (!h) return false
  useHeldStore.getState().add(h)
  usePosStore.getState().reset()
  return true
}

/** Load a held ticket. A non-empty current ticket is parked first, so nothing is ever lost. */
export function resumeTicket(id: string): boolean {
  const target = useHeldStore.getState().held.find((h) => h.id === id)
  if (!target) return false
  const current = toHeld()
  useHeldStore.getState().remove(id)
  if (current) useHeldStore.getState().add(current)
  usePosStore.getState().load(target.ticket)
  return true
}
