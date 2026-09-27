/**
 * 🛡️ One-off repair for the "unpaid Paymob checkout granted free days" bug.
 *
 * Run once after deploying the fix:
 *   npx tsx prisma/fix-unpaid-pending-subscriptions.ts
 *
 * It marks every pending, never-paid subscription as failed and recomputes
 * each affected tenant's status from its real (paid) subscriptions.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const now = new Date()

  const pendings = await db.subscription.findMany({
    where: { status: 'pending', amountPaid: { lte: 0 } },
    select: { id: true, tenantId: true },
  })
  console.log(`Found ${pendings.length} unpaid pending subscriptions`)

  if (pendings.length) {
    await db.subscription.updateMany({
      where: { id: { in: pendings.map((p) => p.id) } },
      data: { status: 'failed', endDate: now, paymentNote: 'voided-unpaid-pending-2026-09-27' },
    })
  }

  const tenantIds = [...new Set(pendings.map((p) => p.tenantId))]
  for (const tenantId of tenantIds) {
    const realSub = await db.subscription.findFirst({
      where: { tenantId, status: 'active', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: realSub ? 'active' : 'expired' },
    })
    console.log(`Tenant ${tenantId} -> ${realSub ? 'active' : 'expired'}`)
  }

  console.log('Done.')
}

main().finally(() => db.$disconnect())
