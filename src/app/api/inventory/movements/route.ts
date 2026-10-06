import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'

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
  if (from || to) {
    const tz = await getTenantTimezone(s.tenantId)
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

  const rows = await db.stockMovement.findMany({
    where,
    orderBy: { id: 'desc' },
    take: 1000,
    include: {
      product: { select: { name: true, barcode: true } },
      branch: { select: { name: true } },
    },
  })
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
  return NextResponse.json(result)
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
