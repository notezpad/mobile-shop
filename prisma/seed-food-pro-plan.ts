/**
 * 🥬 2026-11-04 (التحديث 26): Seed الباقة الاحترافية الغذائية المخفية (food-pro).
 * Idempotent: uses upsert on `code`.
 *
 * الباقة دي هي «الباقة الأعلى» اللي زميل التطوير طلبها للغذائية:
 * كل مزايا food-basic + الموارد البشرية مشمولة (حضور وإجازات ورواتب).
 * مخفية زي food-basic — بتتسند للمحلات من لوحة الأدمن (assign-plan)
 * أو عبر أكواد تفعيل، ومش بتظهر أبداً في:
 *   - صفحة الهبوط (Landing)
 *   - صفحة الأسعار (/pricing)
 *   - صفحة التسجيل الذاتي (/signup) — guard الـ visibility='hidden'
 *   - التبديل الذاتي من الإعدادات (switch-plan بيرفض hidden)
 *
 * ملاحظات:
 *   - enabledModules فيها 'hr' من البداية، وقاعدة enforceVerticalRules
 *     فيها استثناء food-pro (شوف plan-constants.ts التحديث 26) — فالقاعدة
 *     الغذائية ما تمسحش HR منها.
 *   - الأسعار 429/4290 قرار مبدئي (food-basic 299 + إضافة HR 149 = 448
 *     منفصلة → مجملة 429). التعديل من لوحة الأدمن أو SQL.
 *   - حدود المستخدمين/الفروع/المنتجات نفس food-basic (10/10000/5) —
 *     وفوقها الإضافات المدفوعة بتتراكم عادي (فرع/مستخدم إضافي).
 *
 * Run once after applying the migration:
 *   bun run tsx prisma/seed-food-pro-plan.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// موديولات الغذائية (بدون صيانة وبدون معاملات مالية) + الموارد البشرية.
const FOOD_PRO_MODULES = [
  'dashboard', 'pos', 'products', 'sales', 'customers', 'suppliers',
  'purchases', 'inventory', 'expenses', 'cash', 'reports', 'settings',
  'users', 'branches', 'hr',
]

const FOOD_PRO_PLAN = {
  code: 'food-pro',
  name: 'المواد الغذائية — احترافية (مخفية)',
  description:
    'كل مزايا الغذائية الأساسية + الموارد البشرية مشمولة: حضور وانصراف الموظفين، الإجازات، وكشف رواتب شهري مع الدفعات المقدمة. للسلاسل والمحلات الكبيرة — تُسند للمحلات من لوحة الأدمن أو بأكواد التفعيل.',
  priceMonthly: 429,
  priceYearly: 4290,
  maxUsers: 10,
  maxProducts: 10_000,
  maxBranches: 5,
  businessType: 'food',
  enabledModules: FOOD_PRO_MODULES,
  capabilities: ['multi_unit', 'returns_exchange'] as string[],
  features: [
    'بيع بالكيلو بالوزن (كميات بكسور)',
    'وحدات بيع: كيس / طبق / برطمان / كرتونة',
    'الموارد البشرية مشمولة: حضور وإجازات ورواتب',
    'كل مزايا الغذائية الأساسية',
    'نقطة بيع كاملة + خزنة ومصروفات',
    'تقارير مبيعات وأرباح',
  ] as string[],
  sortOrder: 55,
  // 🥬 الباقة المخفية — مش بتظهر في اللاندينج/الأسعار/التسجيل
  visibility: 'hidden',
}

async function main() {
  await db.plan.upsert({
    where: { code: FOOD_PRO_PLAN.code },
    update: {
      name: FOOD_PRO_PLAN.name,
      description: FOOD_PRO_PLAN.description,
      priceMonthly: FOOD_PRO_PLAN.priceMonthly,
      priceYearly: FOOD_PRO_PLAN.priceYearly,
      maxUsers: FOOD_PRO_PLAN.maxUsers,
      maxProducts: FOOD_PRO_PLAN.maxProducts,
      maxBranches: FOOD_PRO_PLAN.maxBranches,
      businessType: FOOD_PRO_PLAN.businessType,
      enabledModules: JSON.stringify(FOOD_PRO_PLAN.enabledModules),
      capabilities: JSON.stringify(FOOD_PRO_PLAN.capabilities),
      features: JSON.stringify(FOOD_PRO_PLAN.features),
      isActive: true,
      sortOrder: FOOD_PRO_PLAN.sortOrder,
      visibility: FOOD_PRO_PLAN.visibility,
    },
    create: {
      code: FOOD_PRO_PLAN.code,
      name: FOOD_PRO_PLAN.name,
      description: FOOD_PRO_PLAN.description,
      priceMonthly: FOOD_PRO_PLAN.priceMonthly,
      priceYearly: FOOD_PRO_PLAN.priceYearly,
      maxUsers: FOOD_PRO_PLAN.maxUsers,
      maxProducts: FOOD_PRO_PLAN.maxProducts,
      maxBranches: FOOD_PRO_PLAN.maxBranches,
      trialDays: 0,
      businessType: FOOD_PRO_PLAN.businessType,
      enabledModules: JSON.stringify(FOOD_PRO_PLAN.enabledModules),
      capabilities: JSON.stringify(FOOD_PRO_PLAN.capabilities),
      features: JSON.stringify(FOOD_PRO_PLAN.features),
      isActive: true,
      sortOrder: FOOD_PRO_PLAN.sortOrder,
      visibility: FOOD_PRO_PLAN.visibility,
    },
  })
  console.log(`✓ upserted plan ${FOOD_PRO_PLAN.code} (visibility=hidden, businessType=food, hr included)`)
  console.log(`    modules: ${FOOD_PRO_MODULES.join(', ')}`)
  console.log(`    caps:    ${FOOD_PRO_PLAN.capabilities.join(', ')}`)
  console.log('')
  console.log('📌 الباقة مخفية — اسندها للمحلات من: لوحة الأدمن → المحلات → إسناد باقة')
  console.log('📌 أو اعمل أكواد تفعيل ليها من: لوحة الأدمن → أكواد التفعيل')
  console.log('📌 عميل food-pro: كارت «إضافات الباقة» هيقول للموارد البشرية «مشمولة في باقتك»')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
