/**
 * Seed the four canonical plans (2 verticals × 2 tiers).
 * Idempotent: uses upsert on `code`.
 *
 * 🛡️ 2026-09-15 (v2): Major fix for the "wrong modules showing in fashion plan" bug.
 *
 *   - ELECTRONICS_* now correctly contains: dashboard, pos, products, sales,
 *     maintenance, customers, suppliers, purchases, inventory, finance,
 *     expenses, cash, reports, settings, users, branches.
 *     (maintenance + finance + expenses + cash are electronics-only.)
 *
 *   - FASHION_* now correctly contains: dashboard, pos, products, sales,
 *     customers, suppliers, purchases, inventory, reports, settings, users,
 *     branches — NO maintenance, NO finance, NO expenses, NO cash.
 *     (Clothing shops don't typically repair devices or run cash drawers
 *     the same way electronics shops do.)
 *
 *   - Variants capability added to BOTH fashion tiers — clothing always
 *     has sizes/colors, this is the core feature.
 *
 *   - FASHION_PRO keeps collections + multi_unit as the pro upsell.
 *
 * Run once after applying the migration:
 *   bun run tsx prisma/seed-plans.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Electronics (mobile / computer) — includes maintenance + financial transactions.
// Both tiers get the same modules; the difference is in limits + capabilities.
const ELECTRONICS_BASIC = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','inventory','finance','expenses','cash','reports','settings',
  'users','branches',
]
const ELECTRONICS_PRO = [...ELECTRONICS_BASIC]

// Fashion (clothing / shoes) — NO maintenance, NO finance (Vodafone Cash/Instapay/Fawry).
// But clothes shops DO have expenses (rent, salaries, utilities) + a cash drawer,
// so those modules stay enabled. Per user request 2026-09-15 (v5).
const FASHION_BASIC = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','reports','settings','users','branches',
]
const FASHION_PRO = [...FASHION_BASIC]

const PLANS = [
  {
    code: 'electronics-basic',
    name: 'أساسية - موبايل وكمبيوتر',
    description: 'إدارة كاملة لمحل الموبايل والكمبيوتر — POS، مخزون، صيانة، معاملات مالية',
    priceMonthly: 299,
    priceYearly: 2990,
    maxUsers: 3,
    maxProducts: 500,
    maxBranches: 1,
    businessType: 'electronics',
    enabledModules: ELECTRONICS_BASIC,
    capabilities: ['returns_exchange'] as string[], // 🛡️ 2026-09-30: المرتجع/الاستبدال متاح لكل الباقات (قرار تجاري)
    sortOrder: 10,
  },
  {
    code: 'electronics-pro',
    name: 'احترافية - موبايل وكمبيوتر',
    description: 'كل مزايا الباقة الأساسية + تقارير متقدمة، فروع، مستخدمين، وبيع بالجملة',
    priceMonthly: 599,
    priceYearly: 5990,
    maxUsers: 10,
    maxProducts: 5000,
    maxBranches: 5,
    businessType: 'electronics',
    enabledModules: ELECTRONICS_PRO,
    capabilities: ['multi_unit', 'returns_exchange', 'dynamic_retail_pricing'], // 🛡️ 2026-10-03: + التسعير الديناميكي للاحترافية
    sortOrder: 20,
  },
  {
    code: 'fashion-basic',
    name: 'أساسية - ملابس وأحذية',
    description: 'إدارة محل الملابس والأحذية — POS، مخزون، مقاسات وألوان، مصروفات، خزنة (بدون صيانة ومعاملات مالية)',
    priceMonthly: 349,
    priceYearly: 3490,
    maxUsers: 3,
    maxProducts: 1000,
    maxBranches: 1,
    businessType: 'fashion',
    enabledModules: FASHION_BASIC,
    capabilities: ['variants', 'returns_exchange'], // ← clothing always has sizes/colors + 🛡️ المرتجع للكل
    sortOrder: 30,
  },
  {
    code: 'fashion-pro',
    name: 'احترافية - ملابس وأحذية',
    description: 'لتجار الجملة — بيع بالكرتونة/الدستة + خصم الكوليكشن. لو حاب تبيع بلقطعة، ضيف القطعة كـ وحدة جملة (factor=1).',
    priceMonthly: 699,
    priceYearly: 6990,
    maxUsers: 10,
    maxProducts: 10000,
    maxBranches: 5,
    businessType: 'fashion',
    enabledModules: FASHION_PRO,
    // 🛡️ 2026-09-15 (v6): Per user request — fashion-pro is for WHOLESALE
    // merchants. They sell by carton/lot (multi_unit), not by individual
    // piece with sizes/colors. If they want to sell by piece, they add a
    // unit with factor=1. So NO 'variants' capability here.
    capabilities: ['collections', 'multi_unit', 'returns_exchange', 'dynamic_retail_pricing'], // 🛡️ 2026-10-03: + التسعير الديناميكي للاحترافية
    sortOrder: 40,
  },
]

async function main() {
  for (const p of PLANS) {
    await db.plan.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        businessType: p.businessType,
        enabledModules: JSON.stringify(p.enabledModules),
        capabilities: JSON.stringify(p.capabilities),
        isActive: true,
        sortOrder: p.sortOrder,
      },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        trialDays: 14,
        businessType: p.businessType,
        enabledModules: JSON.stringify(p.enabledModules),
        capabilities: JSON.stringify(p.capabilities),
        isActive: true,
        sortOrder: p.sortOrder,
      },
    })
    console.log(`✓ upserted plan ${p.code}`)
    console.log(`    modules: ${p.enabledModules.join(', ')}`)
    console.log(`    caps:    ${p.capabilities.length ? p.capabilities.join(', ') : '(none)'}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
