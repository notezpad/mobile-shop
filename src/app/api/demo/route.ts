import { NextResponse } from 'next/server'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { withSql } from '@/lib/sql'
import { getPlanContext } from '@/lib/features'
import { seedDemoData, purgeDemoData, getDemoStatus } from '@/lib/demo-data'
import { purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * 🎁 /api/demo — البيانات التجريبية (2026-10-23)
 *   GET    → حالة البيانات التجريبية (أي مستخدم مسجّل)
 *   POST   → زرع بيانات تجريبية (أدمن فقط، والمحل لازم يكون فاضي)
 *   DELETE → مسح البيانات التجريبية فقط (أدمن فقط)
 * الواجهة بتستدعيه بـ fetch عادي (مش api() الأوفلاين) عشان المسح/الزرع
 * ما يتحطوش في طابور المزامنة — لازم يتنفذوا فعلاً وأونلاين.
 */

/** مسح كاش الحافة اللي ممكن يعرض شاشات قديمة بعد الزرع/المسح */
async function purgeCaches(tenantId: string, branchId: number | null) {
  const entries = [
    ...[7, 14, 30].flatMap((d) => [0, 1].map((p) => ({ pathname: '/api/dashboard', rawQuery: `days=${d}&p=${p}` }))),
    ...[7, 14, 30].map((d) => PURGE_KEYS.dashboard(d)),
    PURGE_KEYS.customersDefault, PURGE_KEYS.categories, PURGE_KEYS.suppliers,
    PURGE_KEYS.branches, PURGE_KEYS.reportsBranches, PURGE_KEYS.users, PURGE_KEYS.expensesDefault,
    PURGE_KEYS.products(branchId), PURGE_KEYS.productsInventory(branchId),
    PURGE_KEYS.products(null), PURGE_KEYS.productsInventory(null),
  ]
  for (const v of ['1', '2', '3']) await purgeEdgeCache(entries, tenantId, v)
}

export async function GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  let status = await withSql((sql) => getDemoStatus(sql, session.tenantId))
  // 🔁 الباقة اتغيّرت لنشاط تاني (مثلاً الأدمن حوّل المحل لباقة المواد الغذائية
  // المخفية بعد التسجيل) والبيانات لسه تجريبية بالكامل → نبدّلها بنشاط الباقة الجديد.
  // لو العميل بدأ شغل فعلي (فواتير حقيقية) مابنلمسش حاجة.
  if (status.active && status.vertical && !status.hasRealSales) {
    const ctx = await getPlanContext(session.tenantId)
    if (ctx.businessType !== status.vertical) {
      status = await withSql(async (sql) => {
        await purgeDemoData(sql, session.tenantId)
        await seedDemoData(sql, {
          tenantId: session.tenantId, userId: session.userId, vertical: ctx.businessType,
          modules: ctx.enabledModules, capabilities: ctx.capabilities, limits: ctx.limits,
          demoUserEmail: `demo-${session.tenantId}@demo.invalid`,
        })
        return getDemoStatus(sql, session.tenantId)
      })
      await purgeCaches(session.tenantId, session.branchId ?? null)
    }
  }
  const res = NextResponse.json(status)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST() {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const ctx = await getPlanContext(session.tenantId)
  const result = await withSql((sql) =>
    seedDemoData(sql, {
      tenantId: session.tenantId,
      userId: session.userId,
      vertical: ctx.businessType,
      modules: ctx.enabledModules,
      capabilities: ctx.capabilities,
      limits: ctx.limits,
      demoUserEmail: `demo-${session.tenantId}@demo.invalid`,
    }),
  )
  if (!result.ok) {
    const msg = result.skipped === 'tenant_not_empty'
      ? 'المحل فيه بيانات بالفعل — البيانات التجريبية بتتحمّل على المحل الفاضي بس'
      : 'تعذّر تحميل البيانات التجريبية'
    return NextResponse.json({ error: msg, reason: result.skipped }, { status: 409 })
  }
  await purgeCaches(session.tenantId, session.branchId ?? null)
  return NextResponse.json(result)
}

export async function DELETE() {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const result = await withSql((sql) => purgeDemoData(sql, session.tenantId))
  await purgeCaches(session.tenantId, session.branchId ?? null)
  await logAudit({ action: 'demo.purge', targetType: 'tenant', targetId: session.tenantId, details: result }).catch(() => {})
  return NextResponse.json(result)
}
