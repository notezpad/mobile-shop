/**
 * 🥬 2026-10-12: Seed الباقة الغذائية المخفية (food-basic).
 * Idempotent: uses upsert on `code`.
 *
 * الباقة دي للأعمال اللي الطلب عليها شغال لكن مش بيعلن عنها —
 * عطارة / مجمدات لحوم ودواجن / بقالة / منظفات. بتتسند للمحلات من
 * لوحة الأدمن (assign-plan) أو عبر أكواد تفعيل، ومش بتظهر أبداً في:
 *   - صفحة الهبوط (Landing)
 *   - صفحة الأسعار (/pricing)
 *   - صفحة التسجيل الذاتي (/signup)
 *
 * ميزاتها:
 *   - بيع بالكيلو بالوزن بكسور (Product.soldByWeight)
 *   - وحدات بيع غذائية (كيس / طبق / برطمان / كرتونة) عبر multi_unit
 *   - NO مقاسات وألوان (variants) — دي ميزات الملابس
 *   - NO كوليكشنات — دي ميزات الملابس
 *   - NO صيانة / معاملات مالية — دي ميزات الموبايلات
 *
 * Run once after applying the migration:
 *   bun run tsx prisma/seed-food-plan.ts   (أو: npx tsx prisma/seed-food-plan.ts)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// نفس موديولات الملابس (بدون صيانة وبدون معاملات مالية) —
// محلات المواد الغذائية عندها مصروفات وخزنة زي أي نشاط تجاري.
const FOOD_MODULES = [
  'dashboard', 'pos', 'products', 'sales', 'customers', 'suppliers',
  'purchases', 'inventory', 'expenses', 'cash', 'reports', 'settings',
  'users', 'branches',
]

const FOOD_PLAN = {
  code: 'food-basic',
  name: 'المواد الغذائية — عطارة / مجمدات / بقالة / منظفات (مخفية)',
  description:
    'باقة مخصصة للمواد الغذائية: بيع بالكيلو بكسور، وحدات كيس/طبق/برطمان، بدون ميزات الملابس (مقاسات/ألوان/كوليكشن) وبدون صيانة أو معاملات مالية. تُسند للمحلات من لوحة الأدمن.',
  priceMonthly: 299,
  priceYearly: 2990,
  maxUsers: 10,
  maxProducts: 10_000,
  maxBranches: 5,
  businessType: 'food',
  enabledModules: FOOD_MODULES,
  capabilities: ['multi_unit', 'returns_exchange'] as string[],
  features: [
    'بيع بالكيلو بالوزن (كميات بكسور)',
    'وحدات بيع: كيس / طبق / برطمان / كرتونة',
    'مخزون ومشتريات وجرد بالكيلو',
    'بدون مقاسات وألوان أو كوليكشنات',
    'نقطة بيع كاملة + خزنة ومصروفات',
    'تقارير مبيعات وأرباح',
  ] as string[],
  sortOrder: 50,
  // 🥬 الباقة المخفية — مش بتظهر في اللاندينج/الأسعار/التسجيل
  visibility: 'hidden',
}

async function main() {
  await db.plan.upsert({
    where: { code: FOOD_PLAN.code },
    update: {
      name: FOOD_PLAN.name,
      description: FOOD_PLAN.description,
      priceMonthly: FOOD_PLAN.priceMonthly,
      priceYearly: FOOD_PLAN.priceYearly,
      maxUsers: FOOD_PLAN.maxUsers,
      maxProducts: FOOD_PLAN.maxProducts,
      maxBranches: FOOD_PLAN.maxBranches,
      businessType: FOOD_PLAN.businessType,
      enabledModules: JSON.stringify(FOOD_PLAN.enabledModules),
      capabilities: JSON.stringify(FOOD_PLAN.capabilities),
      features: JSON.stringify(FOOD_PLAN.features),
      isActive: true,
      sortOrder: FOOD_PLAN.sortOrder,
      visibility: FOOD_PLAN.visibility,
    },
    create: {
      code: FOOD_PLAN.code,
      name: FOOD_PLAN.name,
      description: FOOD_PLAN.description,
      priceMonthly: FOOD_PLAN.priceMonthly,
      priceYearly: FOOD_PLAN.priceYearly,
      maxUsers: FOOD_PLAN.maxUsers,
      maxProducts: FOOD_PLAN.maxProducts,
      maxBranches: FOOD_PLAN.maxBranches,
      trialDays: 0,
      businessType: FOOD_PLAN.businessType,
      enabledModules: JSON.stringify(FOOD_PLAN.enabledModules),
      capabilities: JSON.stringify(FOOD_PLAN.capabilities),
      features: JSON.stringify(FOOD_PLAN.features),
      isActive: true,
      sortOrder: FOOD_PLAN.sortOrder,
      visibility: FOOD_PLAN.visibility,
    },
  })
  console.log(`✓ upserted plan ${FOOD_PLAN.code} (visibility=hidden, businessType=food)`)
  console.log(`    modules: ${FOOD_MODULES.join(', ')}`)
  console.log(`    caps:    ${FOOD_PLAN.capabilities.join(', ')}`)
  console.log('')
  console.log('📌 الباقة مخفية — اسندها للمحلات من: لوحة الأدمن → المحلات → إسناد باقة')
  console.log('📌 أو اعمل أكواد تفعيل ليها من: لوحة الأدمن → أكواد التفعيل')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
