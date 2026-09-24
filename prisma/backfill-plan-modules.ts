/**
 * 🛡️ 2026-09-15 (v3): Backfill plan modules + capabilities.
 *
 * This script fixes the broken plan configs in the DB. It updates the 4
 * canonical plans (electronics-basic, electronics-pro, fashion-basic,
 * fashion-pro) with the correct `enabledModules` and `capabilities` values.
 *
 * The runtime (enforceVerticalRules in lib/plan-constants.ts) ALREADY
 * enforces the same rules at runtime, so you don't NEED to run this
 * script for the user-facing UX to be correct. But running this script
 * makes the DB rows match what the runtime is enforcing — useful for
 * admin UI consistency + future code that reads DB directly.
 *
 * Usage:
 *   bunx tsx prisma/backfill-plan-modules.ts
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const ELECTRONICS_MODULES = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','inventory','finance','expenses','cash','reports','settings',
  'users','branches',
]

// 🛡️ 2026-09-15 (v5): Fashion plans now include `expenses` + `cash`
// (clothes shops have rent + cash drawer too). Only `maintenance` and
// `finance` (Vodafone Cash/Instapay/Fawry) are electronics-only.
const FASHION_MODULES = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','reports','settings','users','branches',
]

const PLANS = [
  {
    code: 'electronics-basic',
    modules: ELECTRONICS_MODULES,
    capabilities: [],
    description: 'إدارة كاملة لمحل الموبايل والكمبيوتر — POS، مخزون، صيانة، معاملات مالية',
  },
  {
    code: 'electronics-pro',
    modules: ELECTRONICS_MODULES,
    capabilities: ['multi_unit'],
    description: 'كل مزايا الباقة الأساسية + تقارير متقدمة، فروع، مستخدمين، وبيع بالجملة',
  },
  {
    code: 'fashion-basic',
    modules: FASHION_MODULES,
    capabilities: ['variants'],
    description: 'إدارة محل الملابس والأحذية — POS، مخزون، مقاسات وألوان، مصروفات، خزنة (بدون صيانة ومعاملات مالية)',
  },
  {
    code: 'fashion-pro',
    modules: FASHION_MODULES,
    // 🛡️ 2026-09-15 (v6): NO 'variants' — fashion-pro is for WHOLESALE
    // merchants who sell by carton/lot via multi_unit, not by individual
    // piece variants. They add a unit with factor=1 if they want to sell
    // a single piece.
    capabilities: ['collections', 'multi_unit'],
    description: 'لتجار الجملة — بيع بالكرتونة/الدستة + خصم الكوليكشن. لو حاب تبيع بلقطعة، ضيف القطعة كـ وحدة جملة (factor=1).',
  },
]

async function main() {
  console.log('🛡️ Plan backfill starting...\n')

  for (const p of PLANS) {
    const plan = await db.plan.findUnique({ where: { code: p.code } })
    if (!plan) {
      console.warn(`! Plan not found in DB: ${p.code} — skipping (run seed-plans.ts first)`)
      continue
    }

    const before = {
      modules: plan.enabledModules ?? '(null)',
      caps: plan.capabilities ?? '(null)',
      description: plan.description ?? '(null)',
    }

    await db.plan.update({
      where: { code: p.code },
      data: {
        enabledModules: JSON.stringify(p.modules),
        capabilities: JSON.stringify(p.capabilities),
        description: p.description,
      },
    })

    console.log(`✓ ${p.code}`)
    console.log(`  before: ${before.modules.substring(0, 80)}...`)
    console.log(`  after:  ${JSON.stringify(p.modules).substring(0, 80)}...`)
    console.log(`  caps before: ${before.caps}`)
    console.log(`  caps after:  ${JSON.stringify(p.capabilities)}`)
    console.log()
  }

  const all = await db.plan.findMany({
    where: { code: { in: PLANS.map((p) => p.code) } },
    select: { code: true, name: true, businessType: true, enabledModules: true, capabilities: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  console.log('── Final state ──')
  for (const p of all) {
    console.log(`  ${p.code} (${p.businessType}) — active=${p.isActive}`)
    console.log(`    modules: ${p.enabledModules}`)
    console.log(`    caps:    ${p.capabilities}`)
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
