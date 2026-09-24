'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from './auth-client'

export type ViewKey =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'sales'
  | 'maintenance'
  | 'customers'
  | 'suppliers'
  | 'purchases'
  | 'finance'
  | 'expenses'
  | 'cash'
  | 'reports'
  | 'settings'
  | 'users'
  | 'inventory'
  | 'branches'

export interface ShopBranding {
  phone: string | null
  address: string | null
  logoPath: string | null
  invoicePrefix: string
}

/**
 * Subscription state (2026-09-13):
 * We NO LONGER lock the user out when the trial expires. Instead, we keep
 * them logged in and show a `TrialExpiredBanner` with a CTA to subscribe.
 * The `expired` flag is set by the (shop)/layout.tsx based on the
 * `/api/subscription` response, and the banner reads it from this store.
 */
export interface SubscriptionState {
  /** True when the latest subscription's endDate < now. */
  expired: boolean
  /** True when expired is false AND daysLeft <= 7. */
  expiringSoon: boolean
  /** Days remaining in the current subscription (negative if expired). */
  daysLeft: number | null
  /** ISO date string of the subscription's end date, or null. */
  endDate: string | null
  /** Plan code, e.g. 'electronics-basic' — null if no subscription. */
  planCode: string | null
  /** Plan name in Arabic, e.g. 'أساسية - موبايل وكمبيوتر'. */
  planName: string | null
  /** Period: 'trial' | 'monthly' | 'yearly' | 'permanent' | '-'. */
  period: string | null
}

export const ALL_MODULES = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','finance','expenses','cash','reports','settings','users',
  'inventory','branches',
] as const

export interface PlanContext {
  businessType: 'electronics' | 'fashion'
  enabledModules: string[]
  capabilities: string[]
}

const DEFAULT_PLAN: PlanContext = {
  businessType: 'electronics',
  enabledModules: [...ALL_MODULES],
  capabilities: [],
}

/* ──────────────────────────────────────────────────────────
   Drafts (2026-09-14): persisted across refresh + tab switches
   ──────────────────────────────────────────────────────────
   These slices hold the in-progress work the user is building in the
   inventory tabs (stocktake + transfers). They are persisted to
   localStorage so that:
     - Switching tabs in the inventory view doesn't lose state.
     - A page refresh keeps the draft.
     - Navigating away to another page and back keeps the draft.

   Each draft is scoped per-tenant (we use `tenantId` from the user
   session as part of the storage key) so different shops on the same
   browser don't see each other's drafts.
*/

export interface StocktakeDraftItem {
  productId: number
  name: string
  barcode: string | null
  systemQty: number
  countedQty: number
}

export interface StocktakeDraft {
  branchId: string
  items: StocktakeDraftItem[]
  note: string
  /** ISO date string of when this draft was last touched — for showing "draft auto-saved" UI. */
  updatedAt: number | null
}

export interface TransfersDraftItem {
  productId: number
  name: string
  quantity: number
  available: number
}

export interface TransfersDraft {
  from: string
  to: string
  items: TransfersDraftItem[]
  note: string
  mode: 'completed' | 'pending'
  updatedAt: number | null
}

interface ShopState {
  activeView: ViewKey
  setActiveView: (v: ViewKey) => void
  shopName: string
  setShopName: (n: string) => void
  branding: ShopBranding
  setBranding: (b: Partial<ShopBranding>) => void
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  plan: PlanContext
  setPlan: (p: Partial<PlanContext>) => void
  /** Shortcut لتحديث enabledModules فقط داخل plan بدون لمس باقي الحقول. */
  setEnabledModules: (modules: string[]) => void
  /** Shortcut لتحديث capabilities فقط داخل plan بدون لمس باقي الحقول. */
  setCapabilities: (capabilities: string[]) => void
  /** Subscription state (expired / expiringSoon / daysLeft / etc.). */
  subscription: SubscriptionState
  setSubscription: (s: Partial<SubscriptionState>) => void
  logout: () => void
  quickAddProduct: { open: boolean; seed?: string }
  openQuickAddProduct: (seed?: string) => void
  closeQuickAddProduct: () => void

  // ── Stocktake draft ──
  stocktakeDraft: StocktakeDraft
  setStocktakeDraft: (d: Partial<StocktakeDraft>) => void
  clearStocktakeDraft: () => void

  // ── Transfers draft ──
  transfersDraft: TransfersDraft
  setTransfersDraft: (d: Partial<TransfersDraft>) => void
  clearTransfersDraft: () => void
}

const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  expired: false,
  expiringSoon: false,
  daysLeft: null,
  endDate: null,
  planCode: null,
  planName: null,
  period: null,
}

const DEFAULT_STOCKTAKE_DRAFT: StocktakeDraft = {
  branchId: '',
  items: [],
  note: '',
  updatedAt: null,
}

const DEFAULT_TRANSFERS_DRAFT: TransfersDraft = {
  from: '',
  to: '',
  items: [],
  note: '',
  mode: 'completed',
  updatedAt: null,
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeView: 'dashboard',
      setActiveView: (v) => set({ activeView: v }),
      shopName: 'محل الاتصالات',
      setShopName: (n) => set({ shopName: n }),
      branding: { phone: null, address: null, logoPath: null, invoicePrefix: 'INV' },
      setBranding: (b) => set((s) => ({ branding: { ...s.branding, ...b } })),
      user: null,
      setUser: (u) => set({ user: u }),
      plan: DEFAULT_PLAN,
      setPlan: (p) => set((s) => ({ plan: { ...s.plan, ...p } })),
      setEnabledModules: (modules) =>
        set((s) => ({ plan: { ...s.plan, enabledModules: modules } })),
      setCapabilities: (capabilities) =>
        set((s) => ({ plan: { ...s.plan, capabilities } })),
      subscription: DEFAULT_SUBSCRIPTION,
      setSubscription: (s) => set((state) => ({ subscription: { ...state.subscription, ...s } })),
      logout: () => {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        // 🛡️ DON'T clear drafts on logout — the storage key is per-tenant
        // so another user on the same browser won't see them anyway.
        set({
          user: null,
          activeView: 'dashboard',
          plan: DEFAULT_PLAN,
          subscription: DEFAULT_SUBSCRIPTION,
        })
      },
      quickAddProduct: { open: false },
      openQuickAddProduct: (seed) =>
        set({ quickAddProduct: { open: true, seed } }),
      closeQuickAddProduct: () =>
        set({ quickAddProduct: { open: false, seed: undefined } }),

      // ── Drafts (persisted) ──
      stocktakeDraft: DEFAULT_STOCKTAKE_DRAFT,
      setStocktakeDraft: (d) =>
        set((s) => ({
          stocktakeDraft: { ...s.stocktakeDraft, ...d, updatedAt: Date.now() },
        })),
      clearStocktakeDraft: () => set({ stocktakeDraft: DEFAULT_STOCKTAKE_DRAFT }),

      transfersDraft: DEFAULT_TRANSFERS_DRAFT,
      setTransfersDraft: (d) =>
        set((s) => ({
          transfersDraft: { ...s.transfersDraft, ...d, updatedAt: Date.now() },
        })),
      clearTransfersDraft: () => set({ transfersDraft: DEFAULT_TRANSFERS_DRAFT }),
    }),
    {
      name: 'shop-store-v1', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // 🛡️ Only persist the drafts — not the user session, subscription,
      // or plan (those come fresh from the API on every page load).
      partialize: (state) => ({
        stocktakeDraft: state.stocktakeDraft,
        transfersDraft: state.transfersDraft,
      }),
      version: 1,
    },
  ),
)
