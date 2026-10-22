'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { clearAuthSnapshot, type AuthUser } from './auth-client'

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
  | 'guide'

export interface ShopBranding {
  phone: string | null
  address: string | null
  logoPath: string | null
  invoicePrefix: string
  /**
   * IANA timezone of the shop (e.g. "Africa/Cairo", "Asia/Riyadh").
   * 🛡️ 2026-09-27: added so the toolbar clock/date can follow the shop's
   * configured timezone instead of the device/browser's local clock —
   * previously `LiveClock` used `new Date()` + `getHours()`/`getMonth()`
   * directly, which reads the *visiting device's* local time. That could
   * visually disagree with "today's sales" (computed server-side from the
   * tenant's `timezone`) whenever an employee's device clock was set to a
   * different zone than the shop's. Defaults to Africa/Cairo to match the
   * tenant's own default until `/api/tenant` responds.
   */
  timezone: string
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
  /** True لو الاشتراك خلص لكن لسه في فترة السماح (الخدمة شغالة). */
  inGrace?: boolean
  /** أيام السماح المتبقية (لو inGrace). */
  graceDaysLeft?: number | null
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
  // 🥬 2026-10-12: أضفنا 'food' (المواد الغذائية) — للواجهة عشان تعرف
  // تعرض/تخفي ميزات النشاط (زي توoggle البيع بالوزن في بطاقة المنتج).
  businessType: 'electronics' | 'fashion' | 'food'
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
  /** 🎨 2026-10-18: لون/مقاس معيّن (null/undefined = منتج عادي) */
  variantId?: number | null
  name: string
  barcode: string | null
  systemQty: number
  countedQty: number
  /** 🥬 2026-10-12: منتج بيع بالوزن — العد بيبقى بالكيلو بكسور */
  soldByWeight?: boolean
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
  /** 🎨 2026-10-18: لون/مقاس معيّن (null/undefined = منتج عادي) */
  variantId?: number | null
  name: string
  quantity: number
  available: number
  /** 🥬 2026-10-12: منتج بيع بالوزن — التحويل بالكيلو بكسور */
  soldByWeight?: boolean
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
  /**
   * 🧠 هل وصلت بيانات الباقة الحقيقية من السيرفر بعد آخر boot؟
   * DEFAULT_PLAN بيقول 'electronics' — فقبل ما /api/subscription يرجع،
   * أي منطق بيعتمد على businessType لازم يستنى (غير كده باقات الملابس
   * بتتتعامل كإلكترونيات لأول لحظات الـ refresh وتفسد الفلتر الذكي).
   */
  planLoaded: boolean
  /** Shortcut لتحديث enabledModules فقط داخل plan بدون لمس باقي الحقول. */
  setEnabledModules: (modules: string[]) => void
  /** Shortcut لتحديث capabilities فقط داخل plan بدون لمس باقي الحقول. */
  setCapabilities: (capabilities: string[]) => void
  /** Subscription state (expired / expiringSoon / daysLeft / etc.). */
  subscription: SubscriptionState
  setSubscription: (s: Partial<SubscriptionState>) => void
  logout: () => Promise<void>
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

  // ── Season closed cache (fashion) ──
  /**
   * 👕 آخر حالة مواسم مقفولة معروفة للمحل (من /api/products/seasonal).
   * بتتحفظ في المتصفح عشان أول تحميل لصفحة المنتجات بعد الـ refresh يبعت
   * view=active من أول طلب — بدل ما كل المنتجات يظهروا ثواني في البداية
   * ويتصفوا لما حالة المواسم توصل (وميض التحميل).
   * (tenantId جواه للمطابقة — نفس نمط الـ drafts)
   */
  seasonClosedCache: { tenantId: string | null; closedSeasons: ('SUMMER' | 'WINTER')[] }
  setSeasonClosedCache: (tenantId: string | null, closedSeasons: ('SUMMER' | 'WINTER')[]) => void
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

const DEFAULT_SEASON_CLOSED_CACHE: { tenantId: string | null; closedSeasons: ('SUMMER' | 'WINTER')[] } = {
  tenantId: null,
  closedSeasons: [],
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      activeView: 'dashboard',
      setActiveView: (v) => set({ activeView: v }),
      shopName: '', // فاضي لحد ما الاسم الحقيقي يوصل من /api/tenant (كان placeholder بيظهر في السايدبار)
      setShopName: (n) => set({ shopName: n }),
      branding: { phone: null, address: null, logoPath: null, invoicePrefix: 'INV', timezone: 'Africa/Cairo' },
      setBranding: (b) => set((s) => ({ branding: { ...s.branding, ...b } })),
      user: null,
      setUser: (u) => set({ user: u }),
      plan: DEFAULT_PLAN,
      planLoaded: false,
      setPlan: (p) => set((s) => ({ plan: { ...s.plan, ...p }, planLoaded: true })),
      setEnabledModules: (modules) =>
        set((s) => ({ plan: { ...s.plan, enabledModules: modules } })),
      setCapabilities: (capabilities) =>
        set((s) => ({ plan: { ...s.plan, capabilities } })),
      subscription: DEFAULT_SUBSCRIPTION,
      setSubscription: (s) => set((state) => ({ subscription: { ...state.subscription, ...s } })),
      logout: async () => {
        // 🛡️ FIX (redirect-loop / Cloudflare 1102): this used to fire the
        // server logout request WITHOUT waiting for it, then immediately
        // clear the client `user` state. That let the redirect to `/`
        // (triggered by `user` becoming null) happen BEFORE the
        // `shop_session` cookie was actually cleared on the server. `/`
        // would then call `/api/auth/me` again, still see the (not-yet-
        // cleared) cookie, think the user was still logged in, and bounce
        // straight back into the authed app — which itself may hard-
        // reload — repeating over and over. That's the "keeps loading /
        // white screen / stuck trying to log out" loop, and each bounce
        // re-runs session + tenant + subscription lookups against the
        // Worker, which is what was blowing through Cloudflare's per-
        // request resource limit (Error 1102) on refresh.
        //
        // Awaiting the request here guarantees the cookie is gone on the
        // server BEFORE we clear local state / redirect, so the very next
        // auth check is unambiguous and there's nothing left to bounce on.
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
          // Network hiccup — still proceed to clear local state below so
          // the user isn't stuck; worst case they're prompted to log in
          // again if the server-side session actually survived.
        }
        // 🛡️ DON'T clear drafts on logout — the storage key is per-tenant
        // so another user on the same browser won't see them anyway.
        set({
          user: null,
          activeView: 'dashboard',
          plan: DEFAULT_PLAN,
          planLoaded: false,
          subscription: DEFAULT_SUBSCRIPTION,
        })
        // 🛡️ PWA (2026-10-07): الخروج لازم يمسح نسخة السيشن المحفوظة
        // أوفلاين كمان — وإلا المستخدم الجديد/الزائر كان ممكن يفتح النظام
        // أوفلاين بحساب الشخص اللي خرج للتو من نفس الجهاز.
        // (apiLogout بيمسحها كمان — ده ضمان إضافي لأي مسار خروج تاني.)
        void clearAuthSnapshot()
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

      // ── Season closed cache (persisted) ──
      seasonClosedCache: DEFAULT_SEASON_CLOSED_CACHE,
      setSeasonClosedCache: (tenantId, closedSeasons) =>
        set({ seasonClosedCache: { tenantId, closedSeasons } }),
    }),
    {
      name: 'shop-store-v1', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // 🛡️ Only persist the drafts + season cache — not the user session,
      // subscription, or plan (those come fresh from the API on every page load).
      partialize: (state) => ({
        stocktakeDraft: state.stocktakeDraft,
        transfersDraft: state.transfersDraft,
        seasonClosedCache: state.seasonClosedCache,
      }),
      version: 1,
    },
  ),
)
