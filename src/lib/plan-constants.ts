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
  'guide',
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
  'guide',
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
  // 🥬 2026-10-12: الباقة الغذائية المخفية (تُسند من الأدمن — مش عامة)
  'food-basic',
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
 * 🛡️ 2026-09-15 (v6) · محدّث 2026-10-05 (v7): Capabilities that should ALWAYS
 * be available on EVERY fashion plan (basic AND pro).
 *
 * `variants` (sizes/colors + المساعد الذكي) is the core of clothing retail —
 * and since v7 it is ALSO on fashion-pro, because:
 *   1. A retail clothing CHAIN (قطاعي بكذا فرع) needs multi-branch (pro)
 *      AND sizes/colors (basic) — the old rule left them stuck between
 *      the two plans with no valid upgrade path.
 *   2. Wholesale merchants are NOT harmed by adding it: variants are
 *      optional per-product — a wholesaler who doesn't create variants
 *      sees nothing new in the UI. Selling by carton/lot (multi_unit)
 *      keeps working exactly as before.
 *   3. The public pricing page already promises pro = "كل ميزات الباقة
 *      الأساسية" — the old runtime strip contradicted that promise.
 */
export const FASHION_MANDATORY_CAPABILITIES = ['variants'] as const

/**
 * 🥬 2026-10-12 (food vertical): Capabilities اللي بتتشد من أي باقة غذائية —
 * دي ميزات الملابس والأحذية اللي محلات المواد الغذائية (عطارة/مجمدات/
 * بقالة/منظفات) متلزمهوش أصلاً، فبنشيلها حتى لو الداتابيز قالت غير كده:
 *   - variants     (مقاسات وألوان + المساعد الذكي) — دي جوهر بيع الملابس
 *   - collections  (كوليكشنات موسمية بخصم موحد) — دي ميزة الأزياء
 *   - dynamic_retail_pricing — التسعير الديناميكي مخصوص لباقات pro العامة
 */
export const FOOD_EXCLUDED_CAPABILITIES = [
  'variants',
  'collections',
  'dynamic_retail_pricing',
] as const

/**
 * 🥬 2026-10-12: وحدات البيع هي جوهر المواد الغذائية (كيلو/كيس/طبق/برطمان)
 * — لازم تكون متاحة في أي باقة غذائية حتى لو الداتابيز نست تضيفها.
 */
export const FOOD_MANDATORY_CAPABILITIES = ['multi_unit'] as const

/**
 * 🛡️ 2026-09-15 (v3 → v4): Vertical rules enforcement.
 *
 * 🥬 2026-10-12: أضفنا النشاط الثالث "food" (المواد الغذائية).
 *
 * قاعدة الـ food مختلفة عن الملابس/الموبايلات في نقطة واحدة مهمة:
 * القواعد بتتطبق على أي باقة businessType='food' — حتى لو الباقة
 * custom صنعها الأدمن بنفسه من لوحة تحكم الباقات. السبب: الأدمن
 * لما يعمل "باقة غذائية" هو متوقع إن ميزات الملابس (مقاسات/ألوان/
 * كوليكشن) مخفية خالص عن زبونه — أي تسريب ليها تجربة سيئة.
 * فعشان كده ما بنستناش كود باقة معين.
 *
 * ملخص القواعد:
 *   - food (أي باقة): شيل maintenance + finance (دي للموبايلات)،
 *     شيل variants + collections + dynamic_retail_pricing (دي للملابس/pro)،
 *     وضمّن multi_unit (وحدات الكيلو/الكيس/الطبق).
 */
export function enforceVerticalRules(
  planCode: string | null | undefined,
  businessType: 'electronics' | 'fashion' | 'food',
  modules: string[],
  capabilities: string[],
): { modules: string[]; capabilities: string[] } {
  // Determine whether to enforce rules for this plan code:
  // - canonical plans → always enforce
  // - legacy plans ('trial', 'free') → enforce IF businessType is fashion
  //   (electronics legacy plans keep everything; this is the safest
  //   fallback for users who haven't been migrated yet)
  // - 🥬 food plans → ALWAYS enforce (canonical or custom) — see note above
  // - custom fashion/electronics plans → no enforcement
  let shouldEnforce = false
  if (businessType === 'food') {
    shouldEnforce = true
  } else if (planCode && CANONICAL_PLAN_CODES.includes(planCode as any)) {
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

    // 🛡️ 2026-09-15 (v6) · محدّث 2026-10-05 (v7): 'variants' على كل باقات
    // الملابس (الأساسية والاحترافية):
    //
    // - fashion-basic (تجزئة): المقاسات والألوان + المساعد الذكي — أساسية أصلاً.
    //
    // - fashion-pro (جملة + سلاسل قطاعي): المقاسات والألوان متاحة برضه.
    //   تاجر الجملة مش هيتأثر — الـ variants اختيارية لكل منتج، وهو أصلاً
    //   مش هيكتب مقاسات، وبيع الكرتونة/الدستة (multi_unit) شغال زي ما هو.
    //   لكن محل القطاعي متعدد الفروع (بيحتاج فروع من الاحترافية + مقاسات
    //   وألوان من الأساسية) كان واقف بين الباقتين — وده اللي اتصلح.
    //
    // - legacy 'trial' / 'free' plans with businessType='fashion':
    //   We don't know if the user is retail or wholesale, so default
    //   to ADDING variants (the safer option — retail is more common).
    //   The user can switch to fashion-pro via /settings → PlanSwitcher.
    for (const c of FASHION_MANDATORY_CAPABILITIES) {
      capSet.add(c)
    }
  }

  // 🥬 2026-10-12 (food vertical): قواعد المواد الغذائية.
  // الهدف: باقة نظيفة مخصوصة — من غير أي حاجة تخص الملابس (مقاسات/ألوان/
  // كوليكشن) ومن غير الصيانة والمعاملات المالية (دي لمحلات الموبايلات).
  // ووحدات البيع (multi_unit) مضمونة موجودة لأنها جوهر الغذائية:
  // كيلو / كيس / طبق / برطمان.
  if (businessType === 'food') {
    // شيل موديولات الموبايلات (الصيانة + المعاملات المالية)
    for (const m of ELECTRONICS_ONLY_MODULES) {
      moduleSet.delete(m)
    }
    // شيل ميزات الملابس + التسعير الديناميكي (bypass protection)
    for (const c of FOOD_EXCLUDED_CAPABILITIES) {
      capSet.delete(c)
    }
    // وحدات البيع الغذائية = جوهر الباقة — مضمونة
    for (const c of FOOD_MANDATORY_CAPABILITIES) {
      capSet.add(c)
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
