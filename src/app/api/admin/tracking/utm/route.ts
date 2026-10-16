import { withDb, db, describeDbConnection } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { buildUtmUrl, sha256Hex, UtmPlatform } from '@/lib/tracking/utm'
import { getCampaignPerformance } from '@/lib/tracking/analytics'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * ⚡ SANDBOX DEMO ADAPTER: خيار mode:'insensitive' خاص بـ PostgreSQL ويرفضه
 * Prisma على SQLite (بيئة المعاينة) فيُسقط الاستعلام كله. على SQLite نستخدم
 * contains العادي — LIKE متساوي الحالات للاتينية أصلاً فالسلوك مكافئ،
 * وفي الإنتاج (PostgreSQL) يمر الخيار كما هو بلا أي تغيير.
 */
const LIKE = (() => {
  // 🛡️ FIX (tsc): describeDbConnection بيرجّع 'hyperdrive' | 'direct' | 'missing'
  // — قيمة 'sqlite-local' القديمة بقت مستحيلة. المعنى المقصود: أي اتصال
  // قاعدة بيانات حقيقي = PostgreSQL → mode:'insensitive' مسموح.
  const insensitive = describeDbConnection() !== 'missing'
  return (v: string) => (insensitive ? { contains: v, mode: 'insensitive' as const } : { contains: v })
})()

/**
 * GET /api/admin/tracking/utm
 * مكتبة الحملات — search + platform filter + archived filter
 * مع أداء كل حملة (آخر 30 يوماً) من بيانات الإسناد الحقيقية.
 */
async function __GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const platform = sp.get('platform') || ''
  const archived = sp.get('archived') === '1'

  const where: Prisma.UtmCampaignWhereInput = {
    archived,
    ...(platform && platform !== 'all' ? { platform } : {}),
    ...(q
      ? {
          OR: [
            { name: LIKE(q) },
            { utmCampaign: LIKE(q) },
            { utmSource: LIKE(q) },
            { fullUrl: LIKE(q) },
          ],
        }
      : {}),
  }

  let campaigns: any[] = []
  let tablesReady = true
  try {
    campaigns = await db.utmCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, name: true, platform: true, destinationUrl: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        utmContent: true, utmTerm: true, utmId: true,
        fullUrl: true, archived: true, createdAt: true, updatedAt: true,
      },
    })
  } catch {
    tablesReady = false
  }

  // أداء الحملات من الإسناد الفعلي (آخر 30 يوماً)
  let performance: Record<string, { registrations: number; purchases: number; revenue: number }> = {}
  if (tablesReady && campaigns.length) {
    try {
      performance = await getCampaignPerformance(db as any, [...new Set(campaigns.map((c) => c.utmCampaign))])
    } catch { /* الأداء اختياري — لا يعطل المكتبة */ }
  }

  return NextResponse.json({ campaigns, performance, tablesReady }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/admin/tracking/utm
 * إنشاء حملة — يمنع التكرار عبر urlHash (SHA-256 للرابط الكامل).
 */
async function __POST(req: NextRequest) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const built = buildUtmUrl({
    destinationUrl: String(body.destinationUrl ?? ''),
    platform: String(body.platform ?? 'custom') as UtmPlatform,
    campaign: String(body.campaign ?? ''),
    content: body.content ? String(body.content) : undefined,
    term: body.term ? String(body.term) : undefined,
    utmId: body.utmId ? String(body.utmId) : undefined,
    source: body.source ? String(body.source) : undefined,
    medium: body.medium ? String(body.medium) : undefined,
    name: body.name ? String(body.name) : undefined,
  })

  if (!built.ok) {
    return NextResponse.json({ error: built.errors[0], errors: built.errors, warnings: built.warnings }, { status: 400 })
  }

  const name = (body.name ? String(body.name) : `${built.campaign} · ${built.source}/${built.medium}`).slice(0, 160)
  const urlHash = await sha256Hex(built.fullUrl)

  // منع التكرار
  const existing = await db.utmCampaign.findUnique({ where: { urlHash }, select: { id: true, name: true } }).catch(() => null)
  if (existing) {
    return NextResponse.json(
      { error: `هذا الرابط محفوظ بالفعل ضمن حملة "${existing.name}"`, duplicateId: existing.id },
      { status: 409 }
    )
  }

  try {
    const created = await db.utmCampaign.create({
      data: {
        name,
        platform: String(body.platform ?? 'custom'),
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
    return NextResponse.json({ ok: true, campaign: created, warnings: built.warnings })
  } catch (e: any) {
    // سباق تكرار محتمل (فهرس فريد urlHash)
    if (String(e?.code) === 'P2002') {
      return NextResponse.json({ error: 'هذا الرابط محفوظ بالفعل' }, { status: 409 })
    }
    if (String(e?.code) === 'P2021') {
      return NextResponse.json({ error: 'جدول UtmCampaign غير موجود — شغّل TRACKING_TABLES.sql أولاً', tablesReady: false }, { status: 503 })
    }
    throw e
  }
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
