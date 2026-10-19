import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-19: بيخدم صورة المنتج كملف حقيقي بدل ما تتبعت base64 جوه JSON القايمة.
 * فك الـ base64 بيتم جوه Postgres (decode) مش في الـ Worker — عشان ما ناكلش من
 * حصة الـ CPU. الرابط فيه ?v=<حجم الصورة> فبنخزنه في المتصفح سنة (immutable):
 * أي صورة بتتحمل مرة واحدة بس.
 */
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id } = await params
    const pid = parseInt(id, 10)
    if (isNaN(pid)) return new NextResponse(null, { status: 400 })

    const rows = await sql<{ body: Buffer | null; mime: string | null; url: string | null }[]>`
      SELECT
        CASE WHEN substr("imagePath", 1, 5) = 'data:'
             THEN decode(substr("imagePath", position(',' in "imagePath") + 1), 'base64') END AS body,
        CASE WHEN substr("imagePath", 1, 5) = 'data:'
             THEN substr("imagePath", 6, position(';' in "imagePath") - 6) END AS mime,
        CASE WHEN substr("imagePath", 1, 5) <> 'data:' THEN "imagePath" END AS url
      FROM "Product"
      WHERE "id" = ${pid} AND "tenantId" = ${session.tenantId}
      LIMIT 1`

    const row = rows[0]
    if (!row) return new NextResponse(null, { status: 404 })

    // صورة برابط خارجي (مش base64) → تحويل عادي
    if (row.url && /^https?:\/\//.test(row.url)) {
      return NextResponse.redirect(row.url, 302)
    }
    if (!row.body || !row.mime || !ALLOWED.has(row.mime)) {
      return new NextResponse(null, { status: 404 })
    }

    return new NextResponse(new Uint8Array(row.body), {
      status: 200,
      headers: {
        'Content-Type': row.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}
