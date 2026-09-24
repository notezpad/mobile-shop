/**
 * Reduce plans to 4 + enable auto-trial on every paid plan.
 *
 * Idempotent. Safe to re-run.
 *
 * What it does:
 *  1. Deactivate every zero-price plan (trial / free / etc.) — preserves history
 *     but hides them from the public pricing page.
 *  2. Activate the 4 canonical paid plans (electronics-basic, electronics-pro,
 *     fashion-basic, fashion-pro).
 *  3. Set trialDays = 14 on every active paid plan so users get a 14-day trial
 *     of the chosen plan with full features.
 *
 * Run after applying the SQL migration, OR standalone:
 *   bun run tsx prisma/seed-plans-reduce-to-4.ts
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
  // 1) Deactivate + delete zero-price plans (trial / free / etc.)
  // 🛡️ 2026-09-17 (v2): also hard-DELETE them (not just soft-deactivate)
  // so they don't clutter the admin UI. Only keep the 4 canonical plans.
  const CANONICAL_CODES = ['electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro']
  const zeroPrice = await db.plan.findMany({
    where: { priceMonthly: 0, priceYearly: 0 },
    select: { id: true, code: true, name: true, isActive: true },
  })
  for (const p of zeroPrice) {
    // Skip canonical plans (shouldn't be zero-price, but just in case)
    if (p.code && CANONICAL_CODES.includes(p.code as any)) {
      console.log(`· skipping canonical plan: ${p.code}`)
      continue
    }
    if (p.isActive) {
      await db.plan.update({ where: { id: p.id }, data: { isActive: false } })
      console.log(`✓ deactivated zero-price plan: ${p.code} (${p.name})`)
    } else {
      console.log(`· zero-price plan already inactive: ${p.code} (${p.name})`)
    }
    // 🛡️ Hard-delete if no subscriptions reference it
    const subsCount = await db.subscription.count({ where: { planId: p.id } })
    if (subsCount === 0) {
      await db.plan.delete({ where: { id: p.id } })
      console.log(`  ✓ hard-deleted: ${p.code}`)
    } else {
      console.log(`  ⚠️ keeping (has ${subsCount} subscription(s))`)
    }
  }

  // 2) Activate the 4 canonical plans
  for (const code of CANONICAL_CODES) {
    const plan = await db.plan.findUnique({ where: { code } })
    if (!plan) {
      console.warn(`! canonical plan not found in DB: ${code} — skipping (run seed-plans.ts first)`)
      continue
    }
    if (!plan.isActive) {
      await db.plan.update({ where: { id: plan.id }, data: { isActive: true } })
      console.log(`✓ re-activated canonical plan: ${code}`)
    } else {
      console.log(`· canonical plan already active: ${code}`)
    }
  }

  // 3) Set trialDays = 14 on every active paid plan
  const activePaid = await db.plan.findMany({
    where: { isActive: true, priceMonthly: { gt: 0 } },
    select: { id: true, code: true, trialDays: true },
  })
  for (const p of activePaid) {
    if (p.trialDays !== 14) {
      await db.plan.update({ where: { id: p.id }, data: { trialDays: 14 } })
      console.log(`✓ set trialDays=14 on plan: ${p.code} (was ${p.trialDays})`)
    } else {
      console.log(`· trialDays already 14 on plan: ${p.code}`)
    }
  }

  // 4) Summary
  const allActive = await db.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, name: true, priceMonthly: true, trialDays: true, businessType: true },
  })
  console.log('\n── Active plans after migration ──')
  for (const p of allActive) {
    console.log(
      `  ${p.code.padEnd(20)} | ${String(p.businessType).padEnd(12)} | ` +
      `${String(p.priceMonthly).padStart(4)} EGP/mo | trial=${p.trialDays}d`,
    )
  }
  console.log(`\nTotal active plans: ${allActive.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
