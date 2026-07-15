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
  | 'finance'
  | 'cash'
  | 'reports'
  | 'settings'
  | 'users'
  | 'inventory'
  | 'branches'

interface ShopState {
  activeView: ViewKey
  setActiveView: (v: ViewKey) => void
  shopName: string
  setShopName: (n: string) => void
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
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
  user: null,
  setUser: (u) => set({ user: u }),
  logout: () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    set({ user: null, activeView: 'dashboard' })
  },
  quickAddProduct: { open: false },
  openQuickAddProduct: (seed) =>
    set({ quickAddProduct: { open: true, seed } }),
  closeQuickAddProduct: () =>
    set({ quickAddProduct: { open: false, seed: undefined } }),
}))
