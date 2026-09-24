/**
 * Backfill script — ensures ALL plans have enabledModules set correctly.
 * Run once after the previous fix to update existing plans in DB:
 *
 *   bun run tsx prisma/backfill-modules.ts
 *
 * This is idempotent — it overwrites enabledModules with the canonical values
 * from seed-plans.ts for each plan code. For unknown plan codes, it leaves them
 * alone (since they might be custom plans created by admin).
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const ALL_MODULES = [
  'dashboard','pos','products','sales','maintenance','customers','suppliers',
  'purchases','finance','expenses','cash','reports','settings','users',
  'inventory','branches',
]

const ELECTRONICS_BASIC = [...ALL_MODULES] // electronics basic gets everything
const ELECTRONICS_PRO = [...ALL_MODULES] // electronics pro gets everything

const FASHION_BASIC = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','settings',
]
const FASHION_PRO = [...FASHION_BASIC, 'reports','branches','users','finance']

const TRIAL_MODULES = [...ALL_MODULES] // trial = everything
const TRIAL_CAPS = ['collections','multi_unit','variants','returns_exchange','loyalty']

const PLAN_MODULES: Record<string, { modules: string[]; capabilities?: string[] }> = {
  'trial': { modules: TRIAL_MODULES, capabilities: TRIAL_CAPS },
  'electronics-basic': { modules: ELECTRONICS_BASIC },
  'electronics-pro': { modules: ELECTRONICS_PRO, capabilities: ['multi_unit'] },
  'fashion-basic': { modules: FASHION_BASIC },
  'fashion-pro': { modules: FASHION_PRO, capabilities: ['collections','multi_unit'] },
}

async function main() {
  const plans = await db.plan.findMany()
  let updated = 0
  let skipped = 0

  for (const plan of plans) {
    const config = PLAN_MODULES[plan.code]
    if (!config) {
      console.log(`⊘ skipped unknown plan: ${plan.code}`)
      skipped += 1
      continue
    }
    await db.plan.update({
      where: { id: plan.id },
      data: {
        enabledModules: JSON.stringify(config.modules),
        capabilities: JSON.stringify(config.capabilities ?? []),
      },
    })
    console.log(`✓ updated plan: ${plan.code} (${config.modules.length} modules)`)
    updated += 1
  }
  console.log(`\nDone: ${updated} plans updated, ${skipped} plans skipped`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
