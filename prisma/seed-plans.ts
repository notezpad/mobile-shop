/**
 * Seed the four canonical plans (2 verticals × 2 tiers).
 * Idempotent: uses upsert on `code`.
 *
 * Run once after applying the migration:
 *   bun run tsx prisma/seed-plans.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Electronics (mobile / computer) — basic and pro both get every module.
// The two tiers differ only in limits (maxUsers/maxProducts/maxBranches/price),
// not in which pages/cards are visible.
const ELECTRONICS_BASIC = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','inventory','finance','expenses','cash','reports','settings',
  'users','branches',
]
const ELECTRONICS_PRO = [...ELECTRONICS_BASIC]

// Fashion basic — NO maintenance, NO finance (per spec). Settings stays visible.
const FASHION_BASIC = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','settings',
]
const FASHION_PRO = [...FASHION_BASIC, 'reports','branches','users']

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
    capabilities: [] as string[],
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
    capabilities: ['multi_unit'],
    sortOrder: 20,
  },
  {
    code: 'fashion-basic',
    name: 'أساسية - ملابس وأحذية',
    description: 'إدارة محل الملابس والأحذية — POS، مخزون (بدون صيانة ومعاملات مالية)',
    priceMonthly: 349,
    priceYearly: 3490,
    maxUsers: 3,
    maxProducts: 1000,
    maxBranches: 1,
    businessType: 'fashion',
    enabledModules: FASHION_BASIC,
    capabilities: [] as string[],
    sortOrder: 30,
  },
  {
    code: 'fashion-pro',
    name: 'احترافية - ملابس وأحذية',
    description: 'كل مزايا الباقة الأساسية + خصم الكوليكشن، والبيع بالجملة (دستة/نص دستة)',
    priceMonthly: 699,
    priceYearly: 6990,
    maxUsers: 10,
    maxProducts: 10000,
    maxBranches: 5,
    businessType: 'fashion',
    enabledModules: FASHION_PRO,
    capabilities: ['collections', 'multi_unit'],
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
        trialDays: 7,
        businessType: p.businessType,
        enabledModules: JSON.stringify(p.enabledModules),
        capabilities: JSON.stringify(p.capabilities),
        isActive: true,
        sortOrder: p.sortOrder,
      },
    })
    console.log(`✓ upserted plan ${p.code}`)
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
