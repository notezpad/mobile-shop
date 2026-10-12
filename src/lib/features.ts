/**
 * Server-only plan helpers (require DB access).
 *
 * 🛡️ 2026-09-15 (v2): Constants + pure helpers split out to
 * `plan-constants.ts` (CLIENT-SAFE — no db import). This file re-exports
 * them so existing API routes keep working with the same import path.
 *
 * DO NOT import this file from a client component — it pulls in Prisma
 * (`db`), `pg` (Postgres driver), and Node's `dns` module, all of which
 * break the browser bundle. Use `@/lib/plan-constants` for client code.
 */

import { db } from './db'
import type { Session } from './auth'

// 🛡️ Re-export client-safe constants + types so existing server imports
// (`import { CRITICAL_MODULES, ALL_MODULES, requireModule } from '@/lib/features'`)
// keep working without any code changes.
export {
  ALL_MODULES,
  ALL_CAPABILITIES,
  CRITICAL_MODULES,
  isCriticalModule,
} from './plan-constants'
export type { ModuleKey, Capability } from './plan-constants'

import type { ModuleKey, Capability } from './plan-constants'
import { CRITICAL_MODULES, enforceVerticalRules } from './plan-constants'

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
  // 🥬 2026-10-12: أضفنا 'food' (المواد الغذائية: عطارة/مجمدات/بقالة/منظفات)
  businessType: 'electronics' | 'fashion' | 'food'
  enabledModules: string[]
  capabilities: string[]
  /** 🛡️ 2026-10-10: حدود الباقة — بتتقرا من نفس Plan المحفوظ.
   * لو مفيش اشتراك/باقة (tenant منتهي مثلاً) القيمة = UNLIMITED_PLAN_LIMIT
   * عشان ما نمنعش مرتين — الـ auth layer هو اللي بيقفل المنتهي أصلاً. */
  limits: {
    maxUsers: number
    maxProducts: number
    maxBranches: number
  }
}

/**
 * 🛡️ 2026-10-10: تمثيل "غير محدود" في الـ admin UI (plan-shared.tsx).
 * أي حد >= القيمة دي بيتعامل كأنه بلا حدود (مفيش فحص).
 */
export const UNLIMITED_PLAN_LIMIT = 999_999

export type LimitKind = 'users' | 'products' | 'branches'

const LIMIT_KIND_LABEL: Record<LimitKind, string> = {
  users: 'مستخدمين',
  products: 'منتجات',
  branches: 'فروع',
}

/**
 * Resolve the enabled modules + capabilities for a tenant.
 * Legacy plans (no enabledModules) get ALL_MODULES for backwards compat.
 *
 * 🛡️ 2026-09-15 (v2): CRITICAL_MODULES is now just [settings, users] —
 * we always add these two, but everything else (maintenance, finance,
 * expenses, cash, etc.) is gated by the plan's enabledModules.
 *
 * 🛡️ 2026-09-15 (v3) · محدّث 2026-10-05 (v7): Added runtime vertical-rules
 * enforcement. Even if the DB still has the OLD broken config (e.g.
 * fashion-basic with maintenance in its modules list, or capabilities
 * = [] without 'variants'), `enforceVerticalRules` will silently fix it
 * for the 4 canonical plans:
 *   - fashion plans (basic AND pro) → strip maintenance, finance,
 *     expenses, cash; ensure 'variants' capability is present (so
 *     clothing shops — retail chains included — can always add
 *     sizes/colors to products)
 *   - electronics-basic/pro → keep everything the DB says
 *
 * This means the user gets the correct UX immediately after deploying
 * the code, WITHOUT needing to apply the SQL migration. The migration
 * is still recommended (it cleans up the DB rows for hygiene) but it's
 * no longer strictly required for the runtime to behave correctly.
 */
const PLAN_CTX_TTL_MS = 60_000
const planCtxCache = new Map<string, { at: number; value: PlanContext }>()

export async function getPlanContext(tenantId: string): Promise<PlanContext> {
  const hit = planCtxCache.get(tenantId)
  if (hit && Date.now() - hit.at < PLAN_CTX_TTL_MS) return hit.value
  const value = await loadPlanContext(tenantId)
  if (planCtxCache.size > 500) planCtxCache.clear()
  planCtxCache.set(tenantId, { at: Date.now(), value })
  return value
}

async function loadPlanContext(tenantId: string): Promise<PlanContext> {
  const sub = await db.subscription.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { endDate: 'desc' },
    include: { plan: true },
  })
  const plan = sub?.plan
  const parsedModules = safeParseArray(plan?.enabledModules ?? null)
  // 🛡️ Force-include the CRITICAL_MODULES in EVERY plan response
  // (just settings + users — everything else is plan-gated)
  const moduleSet = new Set<string>(parsedModules ?? [...ALL_MODULES_LOCAL])
  for (const m of CRITICAL_MODULES) moduleSet.add(m)
  const caps = safeParseArray(plan?.capabilities ?? null) ?? []
  // 🥬 2026-10-12: النشاط الغذائي 'food' — بيتقرا زي ما هو، وأي قيمة
  // تانية غير معروفة بترجع 'electronics' (نفس السلوك القديم).
  const businessType = (
    plan?.businessType === 'fashion' ? 'fashion' : plan?.businessType === 'food' ? 'food' : 'electronics'
  ) as 'electronics' | 'fashion' | 'food'

  // 🛡️ 2026-09-15 (v3): Apply vertical rules at runtime — fixes the
  // user's "still seeing maintenance + finance in fashion plan" bug
  // even if they haven't applied the migration SQL yet.
  const enforced = enforceVerticalRules(
    plan?.code ?? null,
    businessType,
    Array.from(moduleSet),
    caps,
  )

  return {
    businessType,
    enabledModules: enforced.modules,
    capabilities: enforced.capabilities,
    limits: {
      maxUsers: plan?.maxUsers ?? UNLIMITED_PLAN_LIMIT,
      maxProducts: plan?.maxProducts ?? UNLIMITED_PLAN_LIMIT,
      maxBranches: plan?.maxBranches ?? UNLIMITED_PLAN_LIMIT,
    },
  }
}

// Local alias to ALL_MODULES to avoid a circular import — plan-constants
// doesn't import from this file, so the alias is safe.
import { ALL_MODULES as ALL_MODULES_LOCAL } from './plan-constants'

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

/**
 * Throw FeatureError if module not in the tenant's plan.
 *
 * 🛡️ 2026-09-15 (v2): Only `settings` and `users` bypass this check.
 * Maintenance, finance, expenses, cash are now properly gated — only
 * electronics plans can access them.
 */
export async function requireModule(
  session: Pick<Session, 'tenantId' | 'role'>,
  moduleKey: ModuleKey,
) {
  // Super admin bypasses all module gating.
  if (session.role === 'SUPER_ADMIN') return
  // 🛡️ Critical modules bypass the plan check — always allowed.
  if ((CRITICAL_MODULES as readonly string[]).includes(moduleKey)) return
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
  // 🛡️ 2026-09-30 (قرار تجاري): المرتجع/الاستبدال بقى متاح لكل الباقات —
  // بنفترضه هنا مباشرة عشان القاعدة تشتغل فوراً حتى للـ tenants القدامى
  // اللي Plan بتاعهم في الداتابيز لسه ماعدلش (من غير ما تستنى re-seed).
  if ((capability as string) === 'returns_exchange') return
  const ctx = await getPlanContext(session.tenantId)
  if (!ctx.capabilities.includes(capability)) {
    throw new FeatureError(
      'الميزة دي متاحة في باقة أعلى (Pro) — يرجى ترقية الاشتراك',
      403,
    )
  }
}

/**
 * 🛡️ 2026-10-10: فحص حدود الباقة (maxUsers / maxProducts / maxBranches).
 *
 * قبل الإصلاح ده: الحدود كانت بتتحفظ في الـ DB من لوحة الأدمن بس مكان أي
 * فحص فعلي في الـ APIs — فصاحب الباقة كان يقدر يعمل فروع/مستخدمين/منتجات
 * بلا حدود مهما كانت الباقة بتقول.
 *
 * القواعد:
 *  - SUPER_ADMIN يتجاوز الفحص (زي requireModule/requireCapability).
 *  - الحد >= UNLIMITED_PLAN_LIMIT (999999) = "غير محدود" → مفيش فحص.
 *  - لو العدد الحالي >= الحد → FeatureError برسالة عربية واضحة (403).
 *
 * الاستخدام داخل POST handlers:
 *   try { await assertWithinPlanLimit(session, 'branches') }
 *   catch (e) { const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e }
 */
export async function assertWithinPlanLimit(
  session: Pick<Session, 'tenantId' | 'role'>,
  kind: LimitKind,
): Promise<void> {
  // Super admin bypasses all plan gating.
  if (session.role === 'SUPER_ADMIN') return
  const ctx = await getPlanContext(session.tenantId)
  const limit = ctx.limits[kind]
  if (!limit || limit >= UNLIMITED_PLAN_LIMIT) return

  const count =
    kind === 'users'
      ? await db.user.count({ where: { tenantId: session.tenantId } })
      : kind === 'products'
        ? await db.product.count({ where: { tenantId: session.tenantId } })
        : await db.branch.count({ where: { tenantId: session.tenantId } })

  if (count >= limit) {
    throw new FeatureError(
      `وصلت للحد الأقصى لباقتك الحالية (${limit} ${LIMIT_KIND_LABEL[kind]} فقط) — قم بترقية الباقة لإضافة المزيد`,
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
