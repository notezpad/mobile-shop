/**
 * 🛡️ 2026-09-17 (v1): Cleanup legacy plans — keep only the 4 canonical.
 *
 * Usage:
 *   bunx tsx prisma/cleanup-legacy-plans.ts
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const CANONICAL_CODES = [
  'electronics-basic',
  'electronics-pro',
  'fashion-basic',
  'fashion-pro',
] as const

async function main() {
  console.log('🛡️ Legacy plans cleanup starting...\n')

  // ─── 1. Find all non-canonical plans ───
  const allPlans = await db.plan.findMany({
    select: { id: true, code: true, name: true, isActive: true, priceMonthly: true },
    orderBy: { sortOrder: 'asc' },
  })

  console.log(`── All plans in DB (${allPlans.length}) ──`)
  for (const p of allPlans) {
    const isCanonical = CANONICAL_CODES.includes(p.code as any)
    console.log(
      `  ${p.code?.padEnd(20)} | ${p.name?.padEnd(30)} | active=${p.isActive} | ` +
      `${p.priceMonthly} EGP ${isCanonical ? '✓ canonical' : '⚠️ legacy'}`
    )
  }
  console.log()

  const legacyPlans = allPlans.filter(
    (p) => p.code && !CANONICAL_CODES.includes(p.code as any)
  )

  if (legacyPlans.length === 0) {
    console.log('✅ No legacy plans found — DB is already clean.')
    return
  }

  console.log(`── Legacy plans to remove (${legacyPlans.length}) ──`)
  for (const p of legacyPlans) {
    console.log(`  ${p.code} (${p.name})`)
  }
  console.log()

  // ─── 2. Migrate ALL subscriptions on legacy plans to electronics-basic ───
  // 🛡️ 2026-09-17 (v2): migrate ALL subscriptions (not just active) because
  // inactive/cancelled ones still hold an FK reference that would block
  // the plan DELETE.
  const fallbackPlan = await db.plan.findUnique({
    where: { code: 'electronics-basic' },
  })
  if (!fallbackPlan) {
    console.error('❌ electronics-basic plan not found — run seed-plans.ts first')
    process.exit(1)
  }

  for (const legacy of legacyPlans) {
    const subs = await db.subscription.findMany({
      where: { planId: legacy.id },
      select: { id: true, tenantId: true, status: true },
    })
    if (subs.length > 0) {
      console.log(`  Migrating ${subs.length} subscription(s) from "${legacy.code}" → "electronics-basic"`)
      await db.subscription.updateMany({
        where: { planId: legacy.id },
        data: { planId: fallbackPlan.id },
      })
    }
  }

  // ─── 3. Hard-delete legacy plans ───
  // At this point ALL subscriptions have been migrated, so no FK references remain.
  for (const legacy of legacyPlans) {
    // Check if any subscriptions still reference it
    const remainingSubs = await db.subscription.count({
      where: { planId: legacy.id },
    })
    if (remainingSubs > 0) {
      console.log(`  ⚠️ Skipping delete for "${legacy.code}" — ${remainingSubs} subscription(s) still reference it`)
      continue
    }

    await db.plan.delete({ where: { id: legacy.id } })
    console.log(`  ✓ deleted: ${legacy.code}`)
  }

  // ─── 4. Verify ───
  const finalPlans = await db.plan.findMany({
    where: { code: { in: [...CANONICAL_CODES] } },
    select: { code: true, name: true, businessType: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  console.log(`\n── Final state (${finalPlans.length} canonical plans) ──`)
  for (const p of finalPlans) {
    console.log(`  ${p.code} (${p.name}) — active=${p.isActive}`)
  }
  console.log(`\n✅ Cleanup complete. ${finalPlans.length} canonical plans remaining.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
