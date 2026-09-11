import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Public endpoint — returns all active subscription plans.
 * No auth required. Used by the public landing page PricingSection.
 */
export async function GET() {
  try {
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    const rows = plans.map((p) => {
      let featuresList: string[] = []
      if (p.features) {
        try {
          const parsed = JSON.parse(p.features)
          if (Array.isArray(parsed)) {
            featuresList = parsed.filter((x) => typeof x === 'string')
          }
        } catch {
          featuresList = []
        }
      }
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        trialDays: p.trialDays,
        features: featuresList,
        sortOrder: p.sortOrder,
        businessType: p.businessType,
      }
    })

    return NextResponse.json({ items: rows })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'فشل تحميل الباقات' },
      { status: 500 }
    )
  }
}
