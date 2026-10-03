/**
 * 🛡️ 2026-09-15 (v2): Plan + module constants — CLIENT-SAFE.
 *
 * This file MUST NOT import any server-only code (no `db`, no Prisma, no
 * `pg`). It only contains pure constants + pure functions, so it can be
 * safely imported from client components (Sidebar, page.tsx) without
 * pulling the Postgres driver (`pg`) into the browser bundle.
 *
 * The server-only `features.ts` re-exports everything from here for
 * backwards compatibility with existing API routes that already do
 * `import { CRITICAL_MODULES } from '@/lib/features'`.
 */

export const ALL_MODULES = [
  'dashboard',
  'pos',
  'products',
  'sales',
  'maintenance',
  'customers',
  'suppliers',
  'purchases',
  'inventory',
  'finance',
  'expenses',
  'cash',
  'reports',
  'settings',
  'users',
  'branches',
] as const

export type ModuleKey = (typeof ALL_MODULES)[number]

export const ALL_CAPABILITIES = [
  'collections',
  'multi_unit',
  'variants',
  'returns_exchange',
  'loyalty',
  // 🛡️ 2026-10-03: التسعير الديناميكي (cost + هامش %) — باقة احترافية فقط.
  // الباقات الأساسية لا تستخدم هذه الميزة حتى لو كان Tenant.dynamicRetailPricingEnabled=true
  // في الداتابيز (الـ migration أدناه يعمل reset لكلهم).
  'dynamic_retail_pricing',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

/**
 * صفحات حرجة لازم تفتح في كل الباقات بدون استثناء.
 *
 * 🛡️ 2026-09-15 (v2): Major fix for the "wrong modules showing in fashion plan" bug.
 *
 *   - Previously CRITICAL_MODULES included EVERY module (dashboard, pos,
 *     products, sales, maintenance, finance, expenses, cash, reports,
 *     branches, ...). This defeated per-plan gating entirely — every plan
 *     saw every module regardless of what the DB said.
 *
 *   - Now CRITICAL_MODULES only contains `settings` and `users` — the two
 *     pages every shop needs regardless of vertical or tier (a clothing
 *     shop still needs to manage settings and users).
 *
 *   - Maintenance, finance, expenses, cash are now properly gated — they
 *     only appear for electronics plans (where they're in enabledModules).
 */
export const CRITICAL_MODULES = [
  'settings',
  'users',
] as const

/** Returns true if a module is critical (must always be allowed). */
export function isCriticalModule(key: string): boolean {
  return (CRITICAL_MODULES as readonly string[]).includes(key)
}

// ─── Canonical plan codes (the 4 standard SaaS plans) ───
export const CANONICAL_PLAN_CODES = [
  'electronics-basic',
  'electronics-pro',
  'fashion-basic',
  'fashion-pro',
] as const

/**
 * 🛡️ 2026-09-15 (v4): Legacy plans that should ALSO get vertical rules
 * enforced based on their `businessType` field.
 *
 * `trial` is the legacy free plan from before the 4-canonical-plan flow
 * was introduced. Existing tenants signed up on `trial` before the new
 * flow, and the plan has `enabledModules = []` (empty). Without this
 * list, the runtime would fall back to ALL_MODULES (showing everything,
 * including maintenance + finance on fashion shops) and rules would
 * never kick in (because `trial` is not in CANONICAL_PLAN_CODES).
 *
 * Including `trial` here means: if a tenant's plan code is `trial` AND
 * businessType is `fashion`, the runtime will strip maintenance/finance
 * and add `variants` to capabilities — even though the plan code isn't
 * one of the 4 canonical codes. This is a backward-compat safety net.
 *
 * The proper fix is still to migrate the tenant's subscription to a
 * canonical plan (via the backfill script or admin UI), but this ensures
 * the runtime behaves correctly in the meantime.
 */
export const LEGACY_PLANS_WITH_VERTICAL_RULES = ['trial', 'free'] as const

/**
 * Modules that are EXCLUSIVE to electronics plans — fashion plans must NEVER
 * have these, even if the DB somehow says otherwise (e.g. legacy seed that
 * was never migrated). This is a runtime safety layer to ensure the
 * user-visible UX always matches the business-type intent.
 *
 * 🛡️ 2026-09-15 (v5): Per user request — `expenses` (المصروفات) and
 * `cash` (الخزنة) are NO LONGER electronics-only. Clothing shops do have
 * running expenses (rent, salaries, utilities) and a cash drawer, so
 * those modules should be available in BOTH fashion and electronics plans.
 *
 * Only `maintenance` (الصيانة — device repair orders) and `finance`
 * (المعاملات المالية — vodafone cash/instapay/fawry transactions) are
 * truly electronics-only, since clothing shops don't repair devices or
 * run phone-based money-transfer commissions.
 */
export const ELECTRONICS_ONLY_MODULES = [
  'maintenance',
  'finance',
] as const

/**
 * 🛡️ 2026-09-15 (v6): Capabilities that should ALWAYS be available on
 * FASHION-BASIC plans (retail clothing shops). `variants` (sizes/colors)
 * is essential for retail clothing — without it, the user can't add
 * sizes/colors to products.
 *
 * NOTE: This does NOT apply to FASHION-PRO (wholesale plans). Wholesale
 * merchants sell by carton/lot via `multi_unit`, not by individual piece
 * variants. If they want to sell a single piece, they add a unit with
 * factor=1 in their product's wholesale units. So 'variants' is REMOVED
 * from fashion-pro at runtime (see FASHION_PRO_CAPABILITIES_TO_STRIP).
 */
export const FASHION_MANDATORY_CAPABILITIES = ['variants'] as const

/**
 * 🛡️ 2026-09-15 (v6): Capabilities that should be REMOVED from FASHION-PRO
 * plans (wholesale) at runtime, even if the DB has them set.
 *
 * Wholesale merchants don't use variants (sizes/colors per piece) — they
 * sell by carton/lot. The 'variants' UI would just confuse them.
 *
 * If the admin accidentally enabled 'variants' on fashion-pro via the UI,
 * the runtime will silently strip it.
 */
export const FASHION_PRO_CAPABILITIES_TO_STRIP = ['variants'] as const

/**
 * 🛡️ 2026-09-15 (v3 → v4): Vertical rules enforcement.
 *
 * Takes (planCode, businessType, modules, capabilities) and returns the
 * "correct" values per the canonical plan rules. This is a PURE function —
 * it doesn't touch the DB, it just enforces the rules at runtime.
 *
 * Used by getPlanContext (server) as a safety layer on top of whatever the
 * DB says. This way, even if the user hasn't applied the SQL migration yet
 * (so the DB still has the old broken config), the runtime will silently
 * fix the values for:
 *   - The 4 canonical plans (electronics-basic, electronics-pro,
 *     fashion-basic, fashion-pro)
 *   - Legacy plans ('trial', 'free') — when businessType is 'fashion',
 *     rules are enforced. This handles existing tenants who signed up
 *     before the new canonical-plan flow and are still on the `trial`
 *     plan with empty enabledModules.
 *
 *   - electronics-basic/pro/trial(fashion=false) → keep maintenance,
 *     finance, expenses, cash
 *   - fashion-basic/pro/trial(fashion=true) → STRIP maintenance, finance,
 *     expenses, cash; ENSURE 'variants' is in capabilities
 *
 * For custom admin-created plans (not canonical, not legacy), this
 * function is a no-op — we trust whatever the admin configured in the DB.
 */
export function enforceVerticalRules(
  planCode: string | null | undefined,
  businessType: 'electronics' | 'fashion',
  modules: string[],
  capabilities: string[],
): { modules: string[]; capabilities: string[] } {
  // Determine whether to enforce rules for this plan code:
  // - canonical plans → always enforce
  // - legacy plans ('trial', 'free') → enforce IF businessType is fashion
  //   (electronics legacy plans keep everything; this is the safest
  //   fallback for users who haven't been migrated yet)
  // - custom plans → no enforcement
  let shouldEnforce = false
  if (planCode && CANONICAL_PLAN_CODES.includes(planCode as any)) {
    shouldEnforce = true
  } else if (
    planCode &&
    LEGACY_PLANS_WITH_VERTICAL_RULES.includes(planCode as any) &&
    businessType === 'fashion'
  ) {
    shouldEnforce = true
  }

  if (!shouldEnforce) {
    return { modules, capabilities }
  }

  const moduleSet = new Set(modules)
  const capSet = new Set(capabilities)

  if (businessType === 'fashion') {
    // Fashion plans: STRIP electronics-only modules (maintenance, finance).
    // These shouldn't be visible to clothing shops.
    for (const m of ELECTRONICS_ONLY_MODULES) {
      moduleSet.delete(m)
    }

    // 🛡️ 2026-09-15 (v6): Per user business-logic request — differentiate
    // between fashion-basic (retail, NEEDS variants) and fashion-pro
    // (wholesale, NO variants — uses multi_unit only):
    //
    // - fashion-basic (retail clothing):
    //     ENSURE 'variants' is in capabilities — retail clothing shops
    //     sell by piece and need sizes/colors.
    //
    // - fashion-pro (wholesale clothing):
    //     STRIP 'variants' from capabilities — wholesale merchants sell
    //     by carton/lot via multi_unit, not by individual piece variants.
    //     If they want to sell by piece, they add a unit with factor=1.
    //
    // - legacy 'trial' / 'free' plans with businessType='fashion':
    //     We don't know if the user is retail or wholesale, so default
    //     to ADDING variants (the safer option — retail is more common).
    //     The user can switch to fashion-pro via /settings → PlanSwitcher.
    if (planCode === 'fashion-basic') {
      for (const c of FASHION_MANDATORY_CAPABILITIES) {
        capSet.add(c)
      }
    } else if (planCode === 'fashion-pro') {
      for (const c of FASHION_PRO_CAPABILITIES_TO_STRIP) {
        capSet.delete(c)
      }
    } else {
      // Legacy 'trial'/'free' fashion plans — default to retail behavior
      for (const c of FASHION_MANDATORY_CAPABILITIES) {
        capSet.add(c)
      }
    }
  }
  // 🛡️ 2026-10-03: التسعير الديناميكي (dynamic_retail_pricing) — باقة احترافية فقط.
  // نشيله من الباقات الأساسية (electronics-basic, fashion-basic) حتى لو
  // الداتابيز بتقول غير كده. ده يمنع أي bypass عبر API مباشرة.
  // الباقات الاحترافية (electronics-pro, fashion-pro) بتاخده من seed الداتابيز؛
  // enforceVerticalRules مش بتضيفه هنا عشان custom plans تقدر تتحكم فيه.
  if (planCode === 'electronics-basic' || planCode === 'fashion-basic') {
    capSet.delete('dynamic_retail_pricing')
  }
  // For electronics plans we don't strip anything else — the canonical seed
  // has the right modules and we don't want to override admin customizations.
  // The runtime just adds the critical modules (settings, users) which is
  // already handled by the caller.

  return {
    modules: Array.from(moduleSet),
    capabilities: Array.from(capSet),
  }
}
