'use client'

import { create } from 'zustand'
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

export interface PlanContext {
  businessType: 'electronics' | 'fashion'
  enabledModules: string[]
  capabilities: string[]
}

const DEFAULT_PLAN: PlanContext = {
  businessType: 'electronics',
  enabledModules: [
    'dashboard','pos','products','sales','maintenance','customers','suppliers',
    'purchases','finance','expenses','cash','reports','settings','users',
    'inventory','branches',
  ],
  capabilities: [],
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
  logout: () => void
  quickAddProduct: { open: boolean; seed?: string }
  openQuickAddProduct: (seed?: string) => void
  closeQuickAddProduct: () => void
}

export const useShopStore = create<ShopState>((set) => ({
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
  logout: () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    set({ user: null, activeView: 'dashboard', plan: DEFAULT_PLAN })
  },
  quickAddProduct: { open: false },
  openQuickAddProduct: (seed) =>
    set({ quickAddProduct: { open: true, seed } }),
  closeQuickAddProduct: () =>
    set({ quickAddProduct: { open: false, seed: undefined } }),
}))
