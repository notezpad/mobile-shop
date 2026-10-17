import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — صفحة المخزون): GET بقى SQL مباشر عبر postgres.js.
 * كان بيشغّل Prisma wasm + استعلامين (تحويلات بأصنافها + مستخدمين) في *كل* فتح
 * للصفحة (المسار ده مش متخزن على الحافة). نفس شكل الرد بالظبط: مصفوفة تحويلات،
 * كل تحويل بنفس حقول Prisma include (fromBranch/toBranch/items{product}) +
 * createdByName — الـ JSON بيتجمّع جوه PostgreSQL (json_build_object) والـ
 * Worker بيستقبل نص جاهز بدون أي parse/stringify. التواريخ to_char بصيغة
 * Prisma ISO-Z، والكميات float مطابقة. POST فضل Prisma زي ما هو (عملية نادرة).
 */
async function __GETImpl(sql: Sql) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  // نفس where القديم حرفيًا: tenant دايمًا + فرع الجلسة (من/إلى الفرع بتاعه)
  const whereParts = [sql`t."tenantId" = ${s.tenantId}`]
  if (s.branchId) whereParts.push(sql` AND (t."fromBranchId" = ${s.branchId} OR t."toBranchId" = ${s.branchId})`)

  // ⚡ PERF FIX (CPU time / Error 1102): نفس سقف القديم — آخر 300 تحويل
  // (الـ UI بيعرضهم بالترتيب ده ومفيش pagination أصلاً).
  const payloadRows = await sql<{ payload: string }[]>`
    SELECT COALESCE(json_agg(x ORDER BY (x->>'id')::int DESC), '[]'::json)::text AS payload
    FROM (
      SELECT json_build_object(
        'id', t."id", 'tenantId', t."tenantId",
        'fromBranchId', t."fromBranchId", 'toBranchId', t."toBranchId",
        'status', t."status", 'note', t."note", 'createdBy', t."createdBy",
        'createdAt', to_char(t."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'completedAt', CASE WHEN t."completedAt" IS NULL THEN NULL
                       ELSE to_char(t."completedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'fromBranch', json_build_object('name', fb."name"),
        'toBranch', json_build_object('name', tb."name"),
        'items', COALESCE((
          SELECT json_agg(json_build_object(
            'id', ti."id", 'transferId', ti."transferId", 'productId', ti."productId",
            'quantity', ti."quantity",
            'product', CASE WHEN p."id" IS NULL THEN NULL
                       ELSE json_build_object('name', p."name", 'barcode', p."barcode") END
          ) ORDER BY ti."id")
          FROM "TransferItem" ti
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          WHERE ti."transferId" = t."id"
        ), '[]'::json),
        'createdByName', u."name"
      ) AS x
      FROM "Transfer" t
      JOIN "Branch" fb ON fb."id" = t."fromBranchId"
      JOIN "Branch" tb ON tb."id" = t."toBranchId"
      LEFT JOIN "User" u ON u."id" = t."createdBy"
      WHERE ${whereParts}
      ORDER BY t."id" DESC
      LIMIT 300
    ) sub`

  // نص JSON جاهز من PostgreSQL — مباشر للرد بدون أي معالجة في الـ Worker
  return new NextResponse(payloadRows[0]?.payload ?? '[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export async function GET(req: NextRequest) {
  return withSql((sql) => __GETImpl(sql))
}

async function __POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const b = await req.json().catch(() => null)
  const fromBranchId = parseInt(b?.fromBranchId, 10)
  const toBranchId = parseInt(b?.toBranchId, 10)
  const items = Array.isArray(b?.items) ? b.items : []
  const mode = b?.mode === 'pending' ? 'pending' : 'completed' // default: execute immediately
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return NextResponse.json({ error: 'اختر فرعين مختلفين' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للتحويل' }, { status: 400 })
  if (s.branchId && s.branchId !== fromBranchId) return NextResponse.json({ error: 'يمكنك التحويل من فرعك فقط' }, { status: 403 })

  const [fb, tb] = await Promise.all([
    db.branch.findUnique({ where: { id: fromBranchId } }),
    db.branch.findUnique({ where: { id: toBranchId } }),
  ])
  if (!fb || fb.tenantId !== s.tenantId || !tb || tb.tenantId !== s.tenantId)
    return NextResponse.json({ error: 'فرع غير صالح' }, { status: 400 })

  // Validate quantities first (only when about to execute)
  if (mode === 'completed') {
    for (const it of items) {
      const pid = parseInt(it.productId, 10)
      // 🥬 2026-10-12: الكمية Float — تحويل بالوزن (12.5 كيلو بين الفروع)
      const qty = Math.round((Number(it.quantity) || 0) * 1000) / 1000
      if (!pid || !qty || qty <= 0) return NextResponse.json({ error: 'بيانات أصناف غير صالحة' }, { status: 400 })
      const p = await db.product.findUnique({ where: { id: pid } })
      if (!p || p.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
      if (p.quantity + 1e-9 < qty) return NextResponse.json({ error: `الكمية غير متوفرة (${p.name} — متاح: ${Math.round(p.quantity * 1000) / 1000})` }, { status: 400 })
    }
  }

  const created = await db.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        tenantId: s.tenantId,
        fromBranchId, toBranchId,
        status: mode,
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        completedAt: mode === 'completed' ? new Date() : null,
        items: { create: items.map((it: any) => ({ productId: parseInt(it.productId,10), quantity: Math.round((Number(it.quantity) || 0) * 1000) / 1000 })) },
      },
      include: { items: true },
    })
    if (mode === 'pending') return t // just save the draft; no stock movement yet
    for (const it of t.items) {
      if (it.productId == null) throw new Error('منتج غير صالح') // 🛡️ FIX (tsc): productId Int?
      const srcProduct = await tx.product.findUnique({ where: { id: it.productId } })
      if (!srcProduct || srcProduct.tenantId !== s.tenantId) throw new Error('منتج غير صالح')
      if (it.quantity <= 0) throw new Error('كمية غير صالحة')
      if (srcProduct.quantity < it.quantity) throw new Error(`الكمية غير متوفرة (${srcProduct.name})`)
      // decrement source
      await tx.product.update({ where: { id: srcProduct.id }, data: { quantity: { decrement: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: fromBranchId, productId: srcProduct.id,
          type: 'transfer_out', quantity: -it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل إلى ${tb.name}`, userId: s.userId,
        },
      })
      // find or create matching product at destination (same name/barcode)
      let destProduct = await tx.product.findFirst({
        where: {
          tenantId: s.tenantId,
          branchId: toBranchId,
          OR: [
            srcProduct.barcode ? { barcode: srcProduct.barcode } : { name: srcProduct.name },
            { name: srcProduct.name },
          ],
        },
      })
      if (!destProduct) {
        // create dest product without duplicating barcode (barcode is globally unique)
        destProduct = await tx.product.create({
          data: {
            tenantId: s.tenantId,
            branchId: toBranchId,
            name: srcProduct.name,
            category: srcProduct.category,
            barcode: null,
            price: srcProduct.price,
            cost: srcProduct.cost,
            quantity: 0,
            minQuantity: srcProduct.minQuantity,
          },
        })
      }
      await tx.product.update({ where: { id: destProduct.id }, data: { quantity: { increment: it.quantity } } })
      await tx.stockMovement.create({
        data: {
          tenantId: s.tenantId, branchId: toBranchId, productId: destProduct.id,
          type: 'transfer_in', quantity: it.quantity, refType: 'transfer', refId: t.id,
          note: `تحويل من ${fb.name}`, userId: s.userId,
        },
      })
    }
    return t
  })
  return NextResponse.json(created, { status: 201 })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
