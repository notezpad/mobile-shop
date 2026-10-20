import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/audit?limit=50&before=<id>&action=<prefix>
 * قراءة فقط. ترجع آخر العمليات (الأحدث أولًا) مع ترقيم بالـ id (cursor).
 */
async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const sp = new URL(req.url).searchParams
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 200)
  const before = parseInt(sp.get('before') ?? '', 10)
  // فلتر بالبادئة فقط (tenant. / auth. / ...) — محارف LIKE الخاصة بتتشال
  const prefix = (sp.get('action') ?? '').replace(/[^a-z_.]/gi, '').slice(0, 40)

  try {
    const rows = await db.$queryRaw<
      {
        id: number
        actorEmail: string | null
        action: string
        targetType: string | null
        targetId: string | null
        details: string | null
        createdAt: Date
      }[]
    >`
      SELECT "id","actorEmail","action","targetType","targetId","details","createdAt"
      FROM "AuditLog"
      WHERE (${Number.isFinite(before) ? before : null}::int IS NULL OR "id" < ${Number.isFinite(before) ? before : null}::int)
        AND (${prefix}::text = '' OR "action" LIKE ${prefix + '%'})
      ORDER BY "id" DESC
      LIMIT ${limit + 1}`
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
    }))
    return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null })
  } catch (e) {
    console.error('[audit] list failed:', e)
    return NextResponse.json({ items: [], nextCursor: null, notReady: true })
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
