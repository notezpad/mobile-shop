import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds, startOfDayInTz, dateStrInTz } from '@/lib/tenantTime'
import { matchEdgeCache, putEdgeCache, purgeEdgeCache, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

async function __GET(req: NextRequest) {
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

  // ⚡ v10 (2026-10-06) — جزء من إصلاح Error 1102: الـ API القديم كان بيرجّع
  // حتى 1000 حركة بكامل حقولها في *كل* فتح للتبويب و*كل* تغيير فلتر —
  // تسلسل JSON لكل ده كان بيحرق CPU/ذاكرة الـ Worker (تراكم ⇒ 1102).
  // دلوقتي: 50 صف/صفحة من السيرفر + الإجماليات ومنحنى 14 يوم بيتحسبوا
  // جوه PostgreSQL (SUM/GROUP BY) — الـ Worker بيستقبل أرقام صغيرة بس.
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(1000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
  const skip = (page - 1) * limit

  const where: any = { tenantId: s.tenantId, AND: [] as any[] }
  if (s.branchId) where.AND.push({ branchId: s.branchId })
  else if (branchId && branchId !== 'all') {
    if (branchId === 'none') where.AND.push({ branchId: null })
    else where.AND.push({ branchId: parseInt(branchId, 10) })
  }
  if (productId) where.AND.push({ productId: parseInt(productId, 10) })
  if (type && type !== 'all') where.AND.push({ type })
  // 🕐 "from"/"to" هي تواريخ تقويمية بتوقيت المحل (زي 2026-09-27)، فلازم
  // تتحول لحدود UTC بتوقيت المحل نفسه — مش بتوقيت السيرفر (كان
  // `new Date(from)` بيديها منتصف ليل UTC، يعني بتزحلق يوم كامل لأي محل
  // مش على توقيت UTC بالظبط).
  const tz = await getTenantTimezone(s.tenantId)
  if (from || to) {
    if (from) where.AND.push({ createdAt: { gte: localDateStrToUtcBounds(from, 'start', tz) } })
    if (to) where.AND.push({ createdAt: { lte: localDateStrToUtcBounds(to, 'end', tz) } })
  }
  if (q) {
    where.AND.push({
      OR: [
        { product: { name: { contains: q } } },
        { product: { barcode: { contains: q } } },
        { note: { contains: q } },
      ],
    })
  }

  // ⚡ v10 كاش حافة (15 ثانية) — زي نهج /api/reports: التبويب read-heavy
  // (نفس الفلاتر بتتفتح أكتر من مرة)، والمفتاح بيشمل الفرع + كل الفلاتر +
  // الصفحة + tenantId. الـ TTL هو ضمان الحداثة (زي التقارير)، وأي تسجيل
  // حركة يدوي (POST تحت) بيمسح المفتاح الافتراضي فوراً.
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

  // منحنى آخر 14 يوم — بحدود يوم محلي بتوقيت المحل (نفس منهج الداشبورد)
  const seriesStart = startOfDayInTz(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000), tz)
  const seriesWhere = { AND: [...(where.AND as any[]), { createdAt: { gte: seriesStart } }] }

  const [rows, total, inAgg, outAgg, seriesRaw] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit,
      skip,
      include: {
        product: { select: { name: true, barcode: true } },
        branch: { select: { name: true } },
      },
    }),
    db.stockMovement.count({ where }),
    // ميزان الحركة كله بيتحسب في SQL — صفوف slim مبيترجعش للـ Worker أصلاً
    db.stockMovement.aggregate({ where: { ...where, quantity: { gt: 0 } }, _sum: { quantity: true } }),
    db.stockMovement.aggregate({ where: { ...where, quantity: { lt: 0 } }, _sum: { quantity: true } }),
    db.stockMovement.findMany({
      where: seriesWhere,
      select: { quantity: true, createdAt: true },
      orderBy: { id: 'desc' },
      take: 2000,
    }),
  ])
  // `userId` on StockMovement is a plain string (no Prisma relation defined),
  // so resolve names with a separate lookup instead of `include`.
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const result = rows.map((r) => ({
    ...r,
    userName: r.userId ? (userNameById.get(r.userId) ?? null) : null,
  }))

  // تجميع منحنى 14 يوم: صف واحد لكل يوم محلي (GROUP BY مكافئ في JS على
  // صفوف slim صغيرة — الحقول الوحيدة المطلوبة quantity/createdAt)
  const dayMap = new Map<string, { inn: number; out: number }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dayMap.set(dateStrInTz(d, tz), { inn: 0, out: 0 })
  }
  for (const m of seriesRaw) {
    const key = dateStrInTz(m.createdAt, tz)
    const slot = dayMap.get(key)
    if (!slot) continue
    if (m.quantity > 0) slot.inn += m.quantity
    else slot.out += Math.abs(m.quantity)
  }
  const series = Array.from(dayMap.entries()).map(([date, v]) => ({ date, inn: v.inn, out: v.out }))

  const res = NextResponse.json({
    data: result,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    inTotal: inAgg._sum.quantity ?? 0,
    outTotal: Math.abs(outAgg._sum.quantity ?? 0),
    series,
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
  const qty = parseInt(b?.quantity, 10)
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
  let delta = qty
  if (type === 'out') delta = -Math.abs(qty)
  else if (type === 'in') delta = Math.abs(qty)
  else if (type === 'damage') delta = -Math.abs(qty)
  else if (type === 'adjust') delta = qty // signed

  // 🛡️ 2026-09-30: stock must never go below zero — for 'out' AND for a negative
  // 'adjust' (which had no check at all). Fast pre-check for a friendly message,
  // then an atomic conditional UPDATE inside the transaction as the real guard
  // (protects against two concurrent withdrawals / a sale in between).
  if (delta < 0 && product.quantity < Math.abs(delta)) {
    return NextResponse.json({ error: `الكمية غير متوفرة (المتاح: ${product.quantity})` }, { status: 400 })
  }

  // 🛡️ 2026-09-30: قيمة الهالك = الكمية × التكلفة الحالية (المتوسط المرجح).
  // بتتسجل كمصروف "هالك وتالف" يوصل صافي الربح — من غير قيد خزنة،
  // لأن مفيش فلوس خرجت من الخزنة (الخسارة في البضاعة نفسها).
  const lossValue =
    type === 'damage' ? Math.round(Math.abs(delta) * Math.max(0, product.cost) * 100) / 100 : 0

  try {
    const result = await db.$transaction(async (tx) => {
      if (delta < 0) {
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
            note: `هالك: ${product.name} × ${Math.abs(delta)} — ${note}`,
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
          type,
          quantity: delta,
          refType: type === 'damage' ? 'damage' : 'manual',
          refId: damageExpenseId ?? undefined,
          note: note || null,
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

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
