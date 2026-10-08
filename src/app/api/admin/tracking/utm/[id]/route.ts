import { withDb, db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { buildUtmUrl, sha256Hex, UtmPlatform } from '@/lib/tracking/utm'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/admin/tracking/utm/[id]
 * تعديل حملة أو أرشفتها/استعادتها.
 *   body: { archived?: boolean, name?: string, ...utmFields? }
 * عند تعديل حقول الرابط يُعاد البناء ويُفحص التكرار من جديد.
 */
async function __PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id: idRaw } = await params
  const id = Number(idRaw)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const current = await db.utmCampaign.findUnique({ where: { id } })
  if (!current) {
    return NextResponse.json({ error: 'الحملة غير موجودة' }, { status: 404 })
  }

  // أرشفة / استعادة فقط
  if (typeof body.archived === 'boolean' && Object.keys(body).length === 1) {
    const updated = await db.utmCampaign.update({
      where: { id },
      data: { archived: body.archived },
    })
    return NextResponse.json({ ok: true, campaign: updated })
  }

  // تعديل كامل — يُعاد بناء الرابط ثم فحص التكرار
  const built = buildUtmUrl({
    destinationUrl: String(body.destinationUrl ?? current.destinationUrl),
    platform: String(body.platform ?? current.platform) as UtmPlatform,
    campaign: String(body.campaign ?? current.utmCampaign),
    content: body.content !== undefined ? String(body.content) : current.utmContent ?? undefined,
    term: body.term !== undefined ? String(body.term) : current.utmTerm ?? undefined,
    utmId: body.utmId !== undefined ? String(body.utmId) : current.utmId ?? undefined,
    source: body.source !== undefined ? String(body.source) : current.utmSource,
    medium: body.medium !== undefined ? String(body.medium) : current.utmMedium,
  })

  if (!built.ok) {
    return NextResponse.json({ error: built.errors[0], errors: built.errors }, { status: 400 })
  }

  const urlHash = await sha256Hex(built.fullUrl)
  if (urlHash !== current.urlHash) {
    const dup = await db.utmCampaign.findFirst({
      where: { urlHash, id: { not: id } },
      select: { id: true, name: true },
    })
    if (dup) {
      return NextResponse.json({ error: `الرابط الجديد يتعارض مع حملة "${dup.name}"`, duplicateId: dup.id }, { status: 409 })
    }
  }

  const updated = await db.utmCampaign.update({
    where: { id },
    data: {
      name: body.name !== undefined ? String(body.name).slice(0, 160) : current.name,
      platform: String(body.platform ?? current.platform),
      destinationUrl: built.destinationUrl,
      utmSource: built.source,
      utmMedium: built.medium,
      utmCampaign: built.campaign,
      utmContent: built.content || null,
      utmTerm: built.term || null,
      utmId: built.utmId || null,
      fullUrl: built.fullUrl,
      urlHash,
    },
  })
  return NextResponse.json({ ok: true, campaign: updated, warnings: built.warnings })
}

/**
 * DELETE /api/admin/tracking/utm/[id]
 * حذف نهائي للحملة (يُفضَّل الأرشفة للحفاظ على السجل).
 */
async function __DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id: idRaw } = await params
  const id = Number(idRaw)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  await db.utmCampaign.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
