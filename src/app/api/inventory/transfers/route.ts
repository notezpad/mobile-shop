import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'
import { applyTransferItem, validateVariantLines, TransferStockError } from '@/lib/transfer-stock'

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
            'quantity', ti."quantity", 'variantId', ti."variantId",
            'variant', CASE WHEN pv."id" IS NULL THEN NULL
                       ELSE json_build_object('size', pv."size", 'color', pv."color") END,
            'product', CASE WHEN p."id" IS NULL THEN NULL
                       ELSE json_build_object('name', p."name", 'barcode', p."barcode") END
          ) ORDER BY ti."id")
          FROM "TransferItem" ti
          LEFT JOIN "Product" p ON p."id" = ti."productId"
          LEFT JOIN "ProductVariant" pv ON pv."id" = ti."variantId"
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

  // 🎨 بنود التحويل: منتج + (لون/مقاس لو المنتج له ألوان ومقاسات)
  const lines = items.map((it: any) => ({
    productId: parseInt(it.productId, 10),
    variantId: it.variantId != null && it.variantId !== '' ? parseInt(it.variantId, 10) : (null as number | null),
    // 🥬 2026-10-12: الكمية Float — تحويل بالوزن (12.5 كيلو بين الفروع)
    quantity: Math.round((Number(it.quantity) || 0) * 1000) / 1000,
  }))
  for (const l of lines) {
    if (!l.productId || !(l.quantity > 0) || (l.variantId !== null && Number.isNaN(l.variantId))) {
      return NextResponse.json({ error: 'بيانات أصناف غير صالحة' }, { status: 400 })
    }
  }
  {
    const vErr = await validateVariantLines(db, s.tenantId, lines)
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 })
  }

  // فحص مبدئي برسالة لطيفة (الفحص الذري الحقيقي جوه الـ transaction) — بنجمّع
  // البنود المكررة (نفس المنتج/المقاس مرتين) عشان مجموعها هو اللي يتقارن بالمتاح.
  if (mode === 'completed') {
    const need = new Map<string, { productId: number; variantId: number | null; qty: number }>()
    for (const l of lines) {
      const k = `${l.productId}:${l.variantId ?? 0}`
      const cur = need.get(k)
      if (cur) cur.qty += l.quantity
      else need.set(k, { productId: l.productId, variantId: l.variantId, qty: l.quantity })
    }
    for (const n of need.values()) {
      const p = await db.product.findUnique({ where: { id: n.productId } })
      if (!p || p.tenantId !== s.tenantId) return NextResponse.json({ error: 'منتج غير صالح' }, { status: 400 })
      if (n.variantId != null) {
        const v = await db.productVariant.findFirst({ where: { id: n.variantId, productId: n.productId } })
        const label = v ? [v.color, v.size].filter(Boolean).join(' / ') : ''
        if (!v || v.quantity < n.qty) {
          return NextResponse.json({ error: `الكمية غير متوفرة (${p.name} — ${label} — متاح: ${v?.quantity ?? 0})` }, { status: 400 })
        }
      } else if (p.quantity + 1e-9 < n.qty) {
        return NextResponse.json({ error: `الكمية غير متوفرة (${p.name} — متاح: ${Math.round(p.quantity * 1000) / 1000})` }, { status: 400 })
      }
    }
  }

  let created
  try {
    created = await db.$transaction(async (tx) => {
      const t = await tx.transfer.create({
        data: {
          tenantId: s.tenantId,
          fromBranchId, toBranchId,
          status: mode,
          note: b?.note ? String(b.note) : null,
          createdBy: s.userId,
          completedAt: mode === 'completed' ? new Date() : null,
          items: { create: lines.map((l: { productId: number; variantId: number | null; quantity: number }) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) },
        },
        include: { items: true },
      })
      if (mode === 'pending') return t // just save the draft; no stock movement yet
      const ctx = {
        tenantId: s.tenantId,
        userId: s.userId,
        transferId: t.id,
        from: { id: fromBranchId, name: fb.name },
        to: { id: toBranchId, name: tb.name },
      }
      for (const it of t.items) {
        if (it.productId == null) throw new TransferStockError('منتج غير صالح')
        await applyTransferItem(tx, ctx, { productId: it.productId, variantId: it.variantId, quantity: it.quantity })
      }
      return t
    })
  } catch (e) {
    if (e instanceof TransferStockError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
  return NextResponse.json(created, { status: 201 })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => __POST(...args)))
}
