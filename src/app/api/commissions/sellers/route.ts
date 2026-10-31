import { NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * 💰 (التحديث الثالث عشر) قايمة البائعين لمنتقي نقطة البيع — GET /api/commissions/sellers
 *
 * بترجع المستخدمين الشغالين المعلّمين كـ«بائع» (id + name بس — مفيش أي
 * أرقام أو صلاحيات). الكاشير بيندها مرة واحدة عند فتح شاشة البيع، والواجهة
 * بتخفي المنتقي لو الميزة مقفولة أو مفيش بائعين.
 */
export async function GET() {
  let session: Session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  return withSql(async (sql) => {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT "id", "name"
      FROM "User"
      WHERE "tenantId" = ${session.tenantId} AND "isSeller" = true AND "active" = true
      ORDER BY "name" ASC`
    return NextResponse.json(
      { sellers: rows.map((r) => ({ id: String(r.id), name: r.name })) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
