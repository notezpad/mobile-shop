import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds, startOfDayInTz } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'
import { withSql, type Sql } from '@/lib/sql'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — صفحة المخزون): GET بقى SQL مباشر عبر postgres.js.
 * كان بيشغّل Prisma wasm + 6 استعلامات (صفحة + count + مجموعين + منحنى حتى
 * 2000 صف) + تجميع المنحنى في JS عند *كل* فتح للصفحة. الرد { data, total, page,
 * limit, totalPages, inTotal, outTotal, series } بنفس الشكل والقيم بالظبط —
 * الـ JSON بيتجمّع كله جوه PostgreSQL (json_build_object) والـ Worker بيستقبل
 * نص جاهز ويبعته بدون أي parse/stringify (≈ صفر CPU للتسلسل).
 * مطابقة السلوك مع القديم:
 *   - نفس الفلاتر (branch/product/type/from/to/q) وبحث LIKE حساس الحروف
 *   - منحنى 14 يوم: نفس حساب JS القديم (خطوات 24 ساعة من «الآن»، الأيام
 *     المكررة بتندمج، الحركات اللي يومها المحلي مش ضمن الأيام المعروضة بتتساقط)
 *     بس التجميع جوه SQL بصيغة AT TIME ZONE 'UTC' AT TIME ZONE tz الصحيحة
 *   - سقف المنحنى 2000 حركة + الأيام الفارغة {inn:0,out:0}
 *   - كاش الحافة 15 ثانية بنفس المفتاح
 * POST فضل Prisma زي ما هو (عملية نادرة).
 */
async function __GET(req: NextRequest, sql: Sql) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get('branchId')
  const productId = searchParams.get('productId')
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const q = searchParams.get('q')?.trim() || ''

  // ⚡ v10 (2026-10-06) — جزء من إصلاح Error 1102: 50 صف/صفحة والإجماليات
  // ومنحنى 14 يوم بيتحسبوا جوه PostgreSQL — الـ Worker بيستقبل أرقام صغيرة بس.
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(1000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
  const skip = (page - 1) * limit

  // ── شروط الفلترة (نفس where القديم حرفيًا) — بتتشارك بين كل أجزاء الاستعلام ──
  const whereParts = [sql`sm."tenantId" = ${s.tenantId}`]
  if (s.branchId) whereParts.push(sql` AND sm."branchId" = ${s.branchId}`)
  else if (branchId && branchId !== 'all') {
    if (branchId === 'none') whereParts.push(sql` AND sm."branchId" IS NULL`)
    else whereParts.push(sql` AND sm."branchId" = ${parseInt(branchId, 10)}`)
  }
  if (productId) whereParts.push(sql` AND sm."productId" = ${parseInt(productId, 10)}`)
  if (type && type !== 'all') whereParts.push(sql` AND sm."type" = ${type}`)
  const tz = await getTenantTimezone(s.tenantId)
  if (from) whereParts.push(sql` AND sm."createdAt" >= ${localDateStrToUtcBounds(from, 'start', tz)}`)
  if (to) whereParts.push(sql` AND sm."createdAt" <= ${localDateStrToUtcBounds(to, 'end', tz)}`)
  if (q) {
    // 🔍 نفس سلوك Prisma contains (حساس للحروف — بدون mode)
    const pattern = `%${q}%`
    whereParts.push(sql` AND (
      EXISTS (SELECT 1 FROM "Product" pp WHERE pp."id" = sm."productId" AND (pp."name" LIKE ${pattern} OR pp."barcode" LIKE ${pattern}))
      OR sm."note" LIKE ${pattern}
    )`)
  }

  // ⚡ v10 كاش حافة (15 ثانية) — نفس المفتاح والتزمت القديمة حرفيًا
  const filterParts: string[] = [`branch=${s.branchId ?? 0}`]
  for (const [k, v] of [
    ['branchId', branchId ?? ''], ['productId', productId ?? ''], ['type', type ?? ''],
    ['from', from ?? ''], ['to', to ?? ''], ['q', q],
    ['page', String(page)], ['limit', String(limit)],
  ] as const) {
    if (v) filterParts.push(`${k}=${v}`)
  }
  const mvQuery = filterParts.join('&')
  const cachedMv = await matchEdgeCache('/api/inventory/movements', mvQuery, s.tenantId, '1')
  if (cachedMv) return cachedMv

  // بداية نافذة المنحنى — نفس حساب القديم (خطوات 24 ساعة من «الآن»)
  const seriesStart = startOfDayInTz(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000), tz)

  // ⚡ استعلام واحد بيبنى الرد كله جوه PostgreSQL:
  //   - التواريخ to_char بصيغة Prisma ISO-Z (3 أرقام كسور + Z)
  //   - منحنى الأيام: نفس دلالات الـ dayMap القديم (خطوات 24h من now،
  //     DISTINCT = دمج المكرر، LEFT JOIN = تساقط الأيام خارج القائمة)
  const payloadRows = await sql<{ payload: string }[]>`
    SELECT json_build_object(
      'data', COALESCE((
        SELECT json_agg(x ORDER BY (x->>'id')::int DESC)
        FROM (
          SELECT json_build_object(
            'id', sm."id", 'tenantId', sm."tenantId", 'branchId', sm."branchId",
            'productId', sm."productId", 'type', sm."type",
            'quantity', sm."quantity",
            'refType', sm."refType", 'refId', sm."refId", 'note', sm."note",
            'userId', sm."userId",
            'createdAt', to_char(sm."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'product', CASE WHEN p."id" IS NULL THEN NULL
                       ELSE json_build_object('name', p."name", 'barcode', p."barcode") END,
            'branch', CASE WHEN b."id" IS NULL THEN NULL
                      ELSE json_build_object('name', b."name") END,
            'userName', u."name"
          ) AS x
          FROM "StockMovement" sm
          LEFT JOIN "Product" p ON p."id" = sm."productId"
          LEFT JOIN "Branch" b ON b."id" = sm."branchId"
          LEFT JOIN "User" u ON u."id" = sm."userId"
          WHERE ${whereParts}
          ORDER BY sm."id" DESC
          LIMIT ${limit} OFFSET ${skip}
        ) page_rows
      ), '[]'::json),
      'total', t.cnt,
      'page', ${page}::int,
      'limit', ${limit}::int,
      'totalPages', GREATEST(1, CEIL(t.cnt::float8 / ${limit}::float8)::int),
      'inTotal', (SELECT COALESCE(SUM(sm."quantity"), 0)::float8 FROM "StockMovement" sm WHERE ${whereParts} AND sm."quantity" > 0),
      'outTotal', (SELECT COALESCE(ABS(SUM(sm."quantity")), 0)::float8 FROM "StockMovement" sm WHERE ${whereParts} AND sm."quantity" < 0),
      'series', COALESCE((
        SELECT json_agg(json_build_object('date', d.d, 'inn', COALESCE(a.inn, 0), 'out', COALESCE(a.out, 0)) ORDER BY d.d)
        FROM (
          SELECT DISTINCT ((((now() AT TIME ZONE 'UTC') - (g * interval '24 hours')) AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date::text AS d
          FROM generate_series(13, 0, -1) AS g
        ) d
        LEFT JOIN (
          SELECT to_char((x2."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d,
                 SUM(CASE WHEN x2."quantity" > 0 THEN x2."quantity" ELSE 0 END) AS inn,
                 SUM(CASE WHEN x2."quantity" <= 0 THEN (-x2."quantity") ELSE 0 END) AS out
          FROM (
            SELECT sm."createdAt", sm."quantity"
            FROM "StockMovement" sm
            WHERE ${whereParts} AND sm."createdAt" >= ${seriesStart}
            ORDER BY sm."id" DESC
            LIMIT 2000
          ) x2
          GROUP BY 1
        ) a ON a.d = d.d
      ), '[]'::json)
    )::text AS payload
    FROM (SELECT COUNT(*)::int AS cnt FROM "StockMovement" sm WHERE ${whereParts}) t`

  // نص JSON جاهز من PostgreSQL — مباشر للرد بدون أي معالجة في الـ Worker
  const res = new NextResponse(payloadRows[0]?.payload ?? '{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  await putEdgeCache(res.clone(), '/api/inventory/movements', mvQuery, s.tenantId, 15, '1')
  return res
}

async function __POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  // 🛡️ 2026-09-30: الهالك بيسجّل مصروف خسارة في الأرباح والخسائر →
  // بنحدّه بالأدمن زي باقي المصروفات (الصرف/الإضافة العادي متاح للجميع).
  const b = await req.json().catch(() => null)
  const productId = parseInt(b?.productId, 10)
  // 🥬 2026-10-12: الكمية Float — حركة وارد/صرف بالوزن (0.5 كيلو)
  const qty = Math.round((Number(b?.quantity) || 0) * 1000) / 1000
  const type = String(b?.type ?? 'adjust') // in | out | adjust | damage
  if (!['in', 'out', 'adjust', 'damage'].includes(type)) {
    return NextResponse.json({ error: 'نوع الحركة غير صالح' }, { status: 400 })
  }
  if (type === 'damage') {
    try { await requireAdmin() } catch (e) {
      const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
    }
  }
  if (!productId || !qty) return NextResponse.json({ error: 'المنتج والكمية مطلوبان' }, { status: 400 })

  // 🛡️ 2026-09-30: السبب إجباري على أي حركة صادرة (صرف / تعديل سالب / هالك) —
  // قبل كده الملاحظة كانت اختيارية فبتتسجل حركات خصم من غير أي تفسير،
  // ومحدش بيعرف بعدين إيه اللي حصل. الحركة الواردة السبب فيها اختياري.
  const note = b?.note ? String(b.note).trim() : ''
  if (type !== 'in' && note.length < 3) {
    return NextResponse.json(
      { error: 'اكتب سبب الحركة (إجباري للحركة الصادرة / الهالك)' },
      { status: 400 },
    )
  }

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || product.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
  if (s.branchId && product.branchId && product.branchId !== s.branchId) {
    return NextResponse.json({ error: 'لا صلاحية على منتجات فرع آخر' }, { status: 403 })
  }

  // 🎨 2026-10-18: المنتج اللي له ألوان/مقاسات — أي حركة مخزون لازم تتحدد على
  // المقاس/اللون. تعديل Product.quantity لوحده كان بيتمسح عند أول بيعة لأن كمية
  // المنتج بتتحسب دايماً من مجموع الـ variants.
  const variants = await db.productVariant.findMany({
    where: { productId },
    select: { id: true, size: true, color: true, quantity: true },
  })
  let variant: { id: number; size: string | null; color: string | null; quantity: number } | null = null
  if (variants.length > 0) {
    const vid = b?.variantId != null && b.variantId !== '' ? parseInt(b.variantId, 10) : NaN
    variant = variants.find((v) => v.id === vid) ?? null
    if (!variant) {
      return NextResponse.json(
        { error: 'المنتج ده له ألوان ومقاسات — اختار اللون/المقاس اللي عايز تحرّك مخزونه' },
        { status: 400 },
      )
    }
    if (!Number.isInteger(qty)) {
      return NextResponse.json({ error: 'الكمية لازم تكون عدد صحيح' }, { status: 400 })
    }
  } else if (b?.variantId != null && b.variantId !== '') {
    return NextResponse.json({ error: 'المنتج ده ليس له ألوان أو مقاسات' }, { status: 400 })
  }
  const variantLabel = variant ? [variant.color, variant.size].filter(Boolean).join(' / ') || `#${variant.id}` : null
  // المخزون المرجعي للفحص: مخزون الـ variant لو موجود، وإلا المنتج
  const stockRef = variant ? variant.quantity : product.quantity

  let delta = qty
  if (type === 'out') delta = -Math.abs(qty)
  else if (type === 'in') delta = Math.abs(qty)
  else if (type === 'damage') delta = -Math.abs(qty)
  else if (type === 'adjust') delta = qty // signed

  // 🛡️ 2026-09-30: stock must never go below zero — for 'out' AND for a negative
  // 'adjust' (which had no check at all). Fast pre-check for a friendly message,
  // then an atomic conditional UPDATE inside the transaction as the real guard
  // (protects against two concurrent withdrawals / a sale in between).
  if (delta < 0 && stockRef < Math.abs(delta)) {
    return NextResponse.json(
      { error: `الكمية غير متوفرة${variantLabel ? ` للمقاس/اللون ${variantLabel}` : ''} (المتاح: ${stockRef})` },
      { status: 400 },
    )
  }

  // 🛡️ 2026-09-30: قيمة الهالك = الكمية × التكلفة الحالية (المتوسط المرجح).
  // بتتسجل كمصروف "هالك وتالف" يوصل صافي الربح — من غير قيد خزنة،
  // لأن مفيش فلوس خرجت من الخزنة (الخسارة في البضاعة نفسها).
  const lossValue =
    type === 'damage' ? Math.round(Math.abs(delta) * Math.max(0, product.cost) * 100) / 100 : 0

  try {
    const result = await db.$transaction(async (tx) => {
      if (variant) {
        // 🎨 الحركة على الـ variant نفسه (شرط ذري للخصم) + كمية المنتج = مجموعهم
        if (delta < 0) {
          const r = await tx.productVariant.updateMany({
            where: { id: variant.id, productId, quantity: { gte: Math.abs(delta) } },
            data: { quantity: { increment: delta } },
          })
          if (r.count !== 1) throw new Error('INSUFFICIENT_STOCK')
        } else {
          await tx.productVariant.update({ where: { id: variant.id }, data: { quantity: { increment: delta } } })
        }
        await syncProductQuantityFromVariants(tx, productId)
      } else if (delta < 0) {
        const r = await tx.product.updateMany({
          where: { id: productId, tenantId: s.tenantId, quantity: { gte: Math.abs(delta) } },
          data: { quantity: { increment: delta } },
        })
        if (r.count !== 1) throw new Error('INSUFFICIENT_STOCK')
      } else {
        await tx.product.update({ where: { id: productId }, data: { quantity: { increment: delta } } })
      }

      // الهالك أولاً: مصروف الخسارة عشان نربط الحركة بيه (refId)
      let damageExpenseId: number | null = null
      if (type === 'damage') {
        const exp = await tx.expense.create({
          data: {
            tenantId: s.tenantId,
            branchId: product.branchId ?? (s.branchId ?? null),
            category: 'هالك وتالف',
            amount: lossValue,
            note: `هالك: ${product.name}${variantLabel ? ` (${variantLabel})` : ''} × ${Math.abs(delta)} — ${note}`,
            userId: s.userId,
            // source يمنع حذفه من شاشة المصروفات (الحذف بيرجّع فلوس للخزنة غلط)
            source: 'damage',
          },
        })
        damageExpenseId = exp.id
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId,
          branchId: product.branchId ?? (s.branchId ?? null),
          productId,
          variantId: variant?.id ?? null,
          type,
          quantity: delta,
          refType: type === 'damage' ? 'damage' : 'manual',
          refId: damageExpenseId ?? undefined,
          note: variantLabel ? [`[${variantLabel}]`, note].filter(Boolean).join(' ') : (note || null),
          userId: s.userId,
        },
      })
      return { movementId: movement.id, lossValue }
    })

    // ⚡ v10: الحركة الجديدة لازم تظهر فوراً — نمسح مفاتيح كاش الحركة
    // اللي بيطابقها الـ UI فعلاً: الشكل القياسي للـ GET بيكون
    // `branch=X&page=1&limit=50` (الصفحة والحد افتراضياً بيدخلوا المفتاح
    // حتى لو مش في الـ URL) + النسخة القديمة بدون معاملات احتياطاً
    // + كاش قائمة مخزون المنتجات (الكمية اتغيرت)
    const b0 = `branch=${s.branchId ?? 0}`
    await purgeEdgeCache(
      [
        { pathname: '/api/inventory/movements', rawQuery: `${b0}&page=1&limit=50` },
        { pathname: '/api/inventory/movements', rawQuery: b0 },
      ],
      s.tenantId,
      '1'
    )
    await purgeEdgeCache([PURGE_KEYS.productsInventory(s.branchId)], s.tenantId, '3')

    return NextResponse.json({
      ok: true,
      ...(type === 'damage'
        ? {
            lossValue: result.lossValue,
            message: `تم تسجيل الهالك وخسارة ${result.lossValue} في المصروفات`,
          }
        : {}),
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_STOCK') {
      return NextResponse.json({ error: 'الكمية غير متوفرة في المخزن (اتغيّرت أثناء العملية)، حدّث الصفحة وحاول تاني' }, { status: 409 })
    }
    throw e
  }
}

export async function GET(req: NextRequest) {
  return withSql((sql) => __GET(req, sql))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
