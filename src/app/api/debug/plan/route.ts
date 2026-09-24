import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getPlanContext } from '@/lib/features'
import { CANONICAL_PLAN_CODES, ELECTRONICS_ONLY_MODULES, FASHION_MANDATORY_CAPABILITIES } from '@/lib/plan-constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/plan
 *
 * 🛡️ 2026-09-15 (v3): Diagnostic endpoint — shows what the runtime is
 * computing for the current user's plan. The user can hit this to verify
 * that:
 *   - The plan code matches a canonical plan code (so enforceVerticalRules
 *     will kick in)
 *   - The runtime is stripping electronics-only modules from fashion plans
 *   - The runtime is adding 'variants' to fashion capabilities
 *
 * No body required — just GET it from the browser while logged in.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     tenantId: "...",
 *     plan: { code, name, businessType, enabledModules (DB), capabilities (DB) },
 *     runtime: { businessType, enabledModules (after enforce), capabilities (after enforce) },
 *     isCanonicalPlan: true/false,
 *     rules: { stripped: [...], added: [...] },
 *   }
 */
export async function GET() {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    // Read raw plan data from DB (before runtime enforcement)
    const sub = await db.subscription.findFirst({
      where: { tenantId: session.tenantId, status: 'active' },
      orderBy: { endDate: 'desc' },
      include: { plan: true },
    })

    const planCode = sub?.plan?.code ?? null
    const planName = sub?.plan?.name ?? null
    const dbBusinessType = sub?.plan?.businessType ?? null
    let dbEnabledModules: string[] = []
    let dbCapabilities: string[] = []
    try {
      if (sub?.plan?.enabledModules) {
        dbEnabledModules = JSON.parse(sub.plan.enabledModules)
      }
      if (sub?.plan?.capabilities) {
        dbCapabilities = JSON.parse(sub.plan.capabilities)
      }
    } catch {
      /* ignore parse errors */
    }

    // Apply runtime enforcement (same logic as getPlanContext)
    const ctx = await getPlanContext(session.tenantId)
    const isCanonical = planCode ? CANONICAL_PLAN_CODES.includes(planCode as any) : false

    // Compute what the rules did (diff)
    const stripped = dbEnabledModules.filter((m: string) => !ctx.enabledModules.includes(m))
    const added = ctx.capabilities.filter((c: string) => !dbCapabilities.includes(c))

    return NextResponse.json({
      ok: true,
      tenantId: session.tenantId,
      role: session.role,
      plan: {
        code: planCode,
        name: planName,
        businessType: dbBusinessType,
        dbEnabledModules,
        dbCapabilities,
      },
      runtime: {
        businessType: ctx.businessType,
        enabledModules: ctx.enabledModules,
        capabilities: ctx.capabilities,
      },
      diagnostics: {
        isCanonicalPlan: isCanonical,
        canonicalPlanCodes: [...CANONICAL_PLAN_CODES],
        rulesWillRun: isCanonical,
        // Show what was changed by enforceVerticalRules
        modulesStrippedByRuntime: stripped,
        capabilitiesAddedByRuntime: added,
        // Helpful hints
        hint: !isCanonical
          ? '⚠️ Plan code is NOT one of the 4 canonical codes — runtime rules are NOT enforced. The user is on a custom plan and the admin must edit it manually in /admin.'
          : ctx.businessType === 'fashion'
            ? '✓ Fashion plan detected — runtime stripped: ' + ELECTRONICS_ONLY_MODULES.join(', ') + '. Runtime ensured: ' + FASHION_MANDATORY_CAPABILITIES.join(', ')
            : '✓ Electronics plan detected — runtime keeps maintenance + finance + expenses + cash.',
      },
    })
  })
}
