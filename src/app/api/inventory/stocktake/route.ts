import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql, type Sql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — صفحة المخزون): GET بقى SQL مباشر عبر postgres.js.
 * كان بيشغّل Prisma wasm + استعلامين (جلسات الجرد بأصنافها + مستخدمين) في *كل*
 * فتح للصفحة (المسار ده مش متخزن على الحافة). نفس شكل الرد بالظبط: مصفوفة
 * جلسات، كل جلسة بنفس حقول Prisma include (branch/items{product}) +
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
  // نفس where القديم حرفيًا: tenant دايمًا + فرع الجلسة لو موجود
  const whereParts = [sql`st."tenantId" = ${s.tenantId}`]
  if (s.branchId) whereParts.push(sql` AND st."branchId" = ${s.branchId}`)

  // ⚡ PERF FIX (CPU time / Error 1102): نفس سقف القديم — آخر 200 جلسة جرد
  // (الـ UI بيعرضها بالترتيب ده ومفيش pagination أصلاً).
  const payloadRows = await sql<{ payload: string }[]>`
    SELECT COALESCE(json_agg(x ORDER BY (x->>'id')::int DESC), '[]'::json)::text AS payload
    FROM (
      SELECT json_build_object(
        'id', st."id", 'tenantId', st."tenantId", 'branchId', st."branchId",
        'status', st."status", 'note', st."note", 'createdBy', st."createdBy",
        'createdAt', to_char(st."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'committedAt', CASE WHEN st."committedAt" IS NULL THEN NULL
                       ELSE to_char(st."committedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'branch', CASE WHEN b."id" IS NULL THEN NULL
                  ELSE json_build_object('name', b."name") END,
        'items', COALESCE((
          SELECT json_agg(json_build_object(
            'id', si."id", 'stocktakeId', si."stocktakeId", 'productId', si."productId",
            'systemQty', si."systemQty", 'countedQty', si."countedQty", 'diff', si."diff",
            'product', CASE WHEN p."id" IS NULL THEN NULL
                       ELSE json_build_object('name', p."name", 'barcode', p."barcode") END
          ) ORDER BY si."id")
          FROM "StocktakeItem" si
          LEFT JOIN "Product" p ON p."id" = si."productId"
          WHERE si."stocktakeId" = st."id"
        ), '[]'::json),
        'createdByName', u."name"
      ) AS x
      FROM "Stocktake" st
      LEFT JOIN "Branch" b ON b."id" = st."branchId"
      LEFT JOIN "User" u ON u."id" = st."createdBy"
      WHERE ${whereParts}
      ORDER BY st."id" DESC
      LIMIT 200
    ) sub`

  // نص JSON جاهز من PostgreSQL — مباشر للرد بدون أي معالجة في الـ Worker
  return new NextResponse(payloadRows[0]?.payload ?? '[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function __POST(req: NextRequest) {
  let s
  try {
    // 🛡️ 2026-09-30 (X8): اعتماد الجرد بيغيّر أرصدة المخزن فعلياً — أدمن بس.
    s = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body,{status:err?.status})
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const b = await req.json().catch(() => null)
  const branchId = s.branchId ?? (b?.branchId ? parseInt(b.branchId, 10) : null)
  const items = Array.isArray(b?.items) ? b.items : []
  const commit = b?.commit === true
  if (items.length === 0) return NextResponse.json({ error: 'أضف منتجات للجرد' }, { status: 400 })
  // 🛡️ 2026-09-30 (X8): اعتماد الجرد من غير سبب كان بيقبل أي تغيير مجهول.
  if (commit) {
    const reason = b?.note ? String(b.note).trim() : ''
    if (reason.length < 3) {
      return NextResponse.json(
        { error: 'اكتب سبب/مرجع الجرد (إجباري عند الاعتماد — مثال: جرد نهاية الشهر)' },
        { status: 400 },
      )
    }
  }

  const productIds = items.map((it: any) => parseInt(it.productId, 10)).filter(Boolean)
  const products = await db.product.findMany({ where: { id: { in: productIds }, tenantId: s.tenantId } })
  const pMap = new Map<number, (typeof products)[number]>(products.map((p) => [p.id, p]))

  const created = await db.$transaction(async (tx) => {
    const st = await tx.stocktake.create({
      data: {
        tenantId: s.tenantId,
        branchId,
        status: commit ? 'committed' : 'draft',
        note: b?.note ? String(b.note) : null,
        createdBy: s.userId,
        committedAt: commit ? new Date() : null,
        items: {
          create: items.map((it: any) => {
            const pid = parseInt(it.productId, 10)
            // 🥬 2026-10-12: الجرد بالكيلو بكسور (محصى 44.25)
            const counted = Math.round((Number(it.countedQty) || 0) * 1000) / 1000
            // 🛡️ 2026-09-30 (X8): الكمية المعدودة سالب → مرفوضة. كانت بتتحفظ
            // كقيمة مطلقة في المخزن وبتكسر أرضية الصفر اللي باقي النظام بيحافظ عليها.
            if (counted < 0) {
              throw new StocktakeNegativeError(
                `الكمية المعدودة للمنتج "${pMap.get(pid)?.name ?? pid}" لا يمكن أن تكون سالبة`,
              )
            }
            const p = pMap.get(pid)
            const sys = p?.quantity ?? 0
            return { productId: pid, systemQty: sys, countedQty: counted, diff: counted - sys }
          }),
        },
      },
      include: { items: true },
    })
    if (commit) {
      for (const it of st.items) {
        if (it.diff !== 0) {
          // 🛡️ FIX (tsc): productId Int? — بنسكب صفوف المنتج المحذوف.
          if (it.productId == null) continue
          await tx.product.update({ where: { id: it.productId }, data: { quantity: it.countedQty } })
          await tx.stockMovement.create({
            data: {
              tenantId: s.tenantId,
              branchId: branchId ?? undefined,
              productId: it.productId,
              type: 'stocktake',
              quantity: it.diff,
              refType: 'stocktake',
              refId: st.id,
              note: b?.note ? String(b.note).trim() : 'تسوية جرد',
              userId: s.userId,
            },
          })
        }
      }
    }
    return st
  })
  return NextResponse.json(created, { status: 201 })
}

class StocktakeNegativeError extends Error {}

export async function GET() {
  return withSql((sql) => __GETImpl(sql))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(async () => {
    try {
      return await __POST(...args)
    } catch (e) {
      if (e instanceof StocktakeNegativeError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
  })
}
