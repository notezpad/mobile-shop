import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse, assertWithinPlanLimit } from '@/lib/features'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: Wrapped in `withDb` to reuse ONE PrismaClient per request
 * on Cloudflare Workers. Without this, every `db.*` call inside creates a
 * NEW TCP+TLS+auth connection to Supabase (~200-500ms each).
 */

export async function GET() {
  return withDb(async () => {
    let s
    try {
      s = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(s, 'branches')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }
    // ⚡ v12 EDGE CACHE (Error 1102 / CPU limit): الفروع بتتغير نادرًا — 60 ثانية
    // كاش على الحافة يعني أغلب طلبات صفحة الفروع/المستخدمين بتترجع من غير ما
    // نشغّل Prisma أصلاً. أول تشغيل Prisma في isolate بارد هو اللي بياكل
    // الـ 10ms CPU وبيوقع الموقع (شاهد wrangler tail: /api/branches كانت
    // بتقع مع "Worker exceeded CPU time limit") — تقليل طلبات Prisma = قتل
    // الـ 1102 من جذوره. أي إضافة/تعديل/حذف فرع بيمسح الكاش فورًا.
    const cachedBranches = await matchEdgeCache('/api/branches', '', s.tenantId, '1')
    if (cachedBranches) return cachedBranches

    const branches = await db.branch.findMany({
      where: { tenantId: s.tenantId },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
    })
    const res = NextResponse.json(branches)
    await putEdgeCache(res.clone(), '/api/branches', '', s.tenantId, 60, '1')
    return res
  })
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    let s
    try {
      s = await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try {
      await requireModule(s, 'branches')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }
    // 🛡️ 2026-10-10 FIX: فحص حد الفروع (maxBranches) — قبل الإصلاح ده الحد
    // كان بيتحفظ في الباقة بس مكانش بيتفحص هنا، فكان يقدر يعمل فروع بلا حدود.
    try {
      await assertWithinPlanLimit(s, 'branches')
    } catch (e) {
      const fe = featureErrorResponse(e)
      if (fe) return NextResponse.json(fe.body, { status: fe.status })
      throw e
    }
    const b = await req.json().catch(() => null)
    const name = String(b?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'اسم الفرع مطلوب' }, { status: 400 })
    const count = await db.branch.count({ where: { tenantId: s.tenantId } })
    const created = await db.branch.create({
      data: {
        tenantId: s.tenantId,
        name,
        address: b?.address ? String(b.address) : null,
        phone: b?.phone ? String(b.phone) : null,
        active: b?.active !== false,
        isMain: count === 0,
      },
    })
    // ⚡ v12: فرع جديد → امسح كاش الفروع وتقرير الفروع فورًا
    await purgeEdgeCache([PURGE_KEYS.branches, PURGE_KEYS.reportsBranches], s.tenantId, '1')
    return NextResponse.json(created, { status: 201 })
  })
}
