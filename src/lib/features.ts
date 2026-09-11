import { db } from './db'
import type { Session } from './auth'

export const ALL_MODULES = [
  'dashboard',
  'pos',
  'products',
  'sales',
  'maintenance',
  'customers',
  'suppliers',
  'purchases',
  'finance',
  'expenses',
  'cash',
  'reports',
  'settings',
  'users',
  'inventory',
  'branches',
] as const

export type ModuleKey = (typeof ALL_MODULES)[number]

export const ALL_CAPABILITIES = [
  'collections',
  'multi_unit',
  'variants',
  'returns_exchange',
  'loyalty',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

function safeParseArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch {
    /* ignore */
  }
  return null
}

export type PlanContext = {
  businessType: 'electronics' | 'fashion'
  enabledModules: string[]
  capabilities: string[]
}

/**
 * Resolve the enabled modules + capabilities for a tenant.
 * Legacy plans (no enabledModules) get ALL_MODULES for backwards compat.
 */
export async function getPlanContext(tenantId: string): Promise<PlanContext> {
  const sub = await db.subscription.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  })
  const plan = sub?.plan
  const modules = safeParseArray(plan?.enabledModules ?? null)
  const caps = safeParseArray(plan?.capabilities ?? null) ?? []
  const businessType = (plan?.businessType === 'fashion' ? 'fashion' : 'electronics') as
    | 'electronics'
    | 'fashion'
  return {
    businessType,
    enabledModules: modules ?? [...ALL_MODULES],
    capabilities: caps,
  }
}

export async function getTenantModules(tenantId: string): Promise<string[]> {
  const ctx = await getPlanContext(tenantId)
  return ctx.enabledModules
}

export class FeatureError extends Error {
  status: number
  constructor(message: string, status = 403) {
    super(message)
    this.name = 'FeatureError'
    this.status = status
  }
}

/** Throw FeatureError if module not in the tenant's plan. */
export async function requireModule(
  session: Pick<Session, 'tenantId' | 'role'>,
  moduleKey: ModuleKey,
) {
  // Super admin bypasses all module gating.
  if (session.role === 'SUPER_ADMIN') return
  const modules = await getTenantModules(session.tenantId)
  if (!modules.includes(moduleKey)) {
    throw new FeatureError('الميزة دي مش متاحة في باقتك الحالية', 403)
  }
}

export async function requireCapability(
  session: Pick<Session, 'tenantId' | 'role'>,
  capability: Capability,
) {
  if (session.role === 'SUPER_ADMIN') return
  const ctx = await getPlanContext(session.tenantId)
  if (!ctx.capabilities.includes(capability)) {
    throw new FeatureError(
      'الميزة دي متاحة في باقة أعلى (Pro) — يرجى ترقية الاشتراك',
      403,
    )
  }
}

/** Helper to convert FeatureError into a NextResponse-friendly shape. */
export function featureErrorResponse(e: unknown): { status: number; body: { error: string } } | null {
  if (e instanceof FeatureError) {
    return { status: e.status, body: { error: e.message } }
  }
  return null
}
