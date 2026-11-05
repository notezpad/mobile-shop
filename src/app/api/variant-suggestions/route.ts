import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, requireModuleWritePermission, featureErrorResponse } from '@/lib/features'
import { cleanSuggestionValue, normalizeSuggestionKey, MAX_SUGGESTION_LEN } from '@/lib/variant-suggestions'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['cpu', 'gpu'])
const MAX_PER_KIND = 500

/** GET ?kind=cpu|gpu → [{ id, value }] (الأحدث الأول) — خاص بالمحل بس */
export async function GET(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try { await requireModule(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }
    const kind = req.nextUrl.searchParams.get('kind') ?? ''
    if (!KINDS.has(kind)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
    const rows = await db.variantSuggestion.findMany({
      where: { tenantId: session.tenantId, kind },
      orderBy: { id: 'desc' },
      select: { id: true, value: true },
      take: MAX_PER_KIND,
    })
    return NextResponse.json(rows)
  })
}

/** POST { kind, value } → بيحفظ لو جديد، وبيرجّع الموجود لو متكرر (بعد التنضيف) */
export async function POST(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }
    const body = await req.json().catch(() => null)
    const kind = String(body?.kind ?? '')
    const value = cleanSuggestionValue(body?.value)
    if (!KINDS.has(kind)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
    if (!value || value.length > MAX_SUGGESTION_LEN) {
      return NextResponse.json({ error: 'القيمة مطلوبة (حتى 60 حرف)' }, { status: 400 })
    }
    const normalized = normalizeSuggestionKey(value)
    const existing = await db.variantSuggestion.findUnique({
      where: { tenantId_kind_normalized: { tenantId: session.tenantId, kind, normalized } },
      select: { id: true, value: true },
    })
    if (existing) return NextResponse.json(existing)
    const count = await db.variantSuggestion.count({ where: { tenantId: session.tenantId, kind } })
    if (count >= MAX_PER_KIND) {
      return NextResponse.json({ error: 'وصلت للحد الأقصى من الاقتراحات — احذف القديم' }, { status: 400 })
    }
    try {
      const created = await db.variantSuggestion.create({
        data: { tenantId: session.tenantId, kind, value, normalized },
        select: { id: true, value: true },
      })
      return NextResponse.json(created, { status: 201 })
    } catch {
      // سباق نادر: اتحفظت من طلب تاني في نفس اللحظة
      const again = await db.variantSuggestion.findUnique({
        where: { tenantId_kind_normalized: { tenantId: session.tenantId, kind, normalized } },
        select: { id: true, value: true },
      })
      if (again) return NextResponse.json(again)
      return NextResponse.json({ error: 'تعذّر حفظ الاقتراح' }, { status: 500 })
    }
  })
}

/** DELETE { id } → يحذف الاقتراح بس (مش بيلمس أي متغير اتسجّل بيه قبل كده) */
export async function DELETE(req: NextRequest) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }
    const body = await req.json().catch(() => null)
    const id = parseInt(String(body?.id ?? ''), 10)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    const res = await db.variantSuggestion.deleteMany({ where: { id, tenantId: session.tenantId } })
    if (res.count === 0) return NextResponse.json({ error: 'الاقتراح غير موجود' }, { status: 404 })
    return NextResponse.json({ ok: true })
  })
}
