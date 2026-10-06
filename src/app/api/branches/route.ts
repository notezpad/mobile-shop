import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

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
    const branches = await db.branch.findMany({
      where: { tenantId: s.tenantId },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
    })
    return NextResponse.json(branches)
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
    return NextResponse.json(created, { status: 201 })
  })
}
