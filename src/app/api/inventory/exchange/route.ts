import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { round2 } from '@/lib/purchase-return'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30: استبدال بضاعة مع المورد (بضاعة تالفة/مردودة ← بضاعة بديلة).
 *
 * قبل كده مفيش أي طريقة لتسجيل استبدال مع المورد — الحل البيتي كان "حركة
 * مخزون يدوية" وهي بتغيّر الكمية بس: لا بتلمس حساب المورد، ولا بتسجّل
 * فرق القيمة، ولا حتى سبب واضح. هنا الحركة الكاملة:
 *
 *   1. بضاعة خارجة للمورد   (نوع out،  refType = supplier_exchange)
 *   2. بضاعة بديلة داخلية    (نوع in،   refType = supplier_exchange)
 *   3. فرق القيمة بيروح على حساب المورد تلقائياً:
 *        diff = قيمة الوارد − قيمة الصادر
 *        diff > 0 → علينا للمورد زيادة (بضاعة الزيادة عليها حساب)
 *        diff < 0 → رصيد المورد بيقل (البضاعة الراجعة أغلى من البديلة)
 *      لو الصفر → استبدال متكافئ ومفيش أي أثر على الحساب.
 *
 * مفيش قيد خزنة لأن العملية مقايضة بضاعة — الفلوس بس هي اللي بتتحرك
 * من/إلى الخزنة (ده دور مرتجع الشراء الموجود بالفعل).
 *
 * القيمة بتتحسب بسعر التكلفة الحالي (المتوسط المرجح) للصنفين.
 *
 * 🎨 2026-10-19: دعم الألوان/المقاسات — نفس نمط مرتجع المورد (purchase-return):
 *   - السطر على منتج له مقاسات لازم يجي بـ variantId تابع للمنتج نفسه
 *     (الرفض السيرفري يمنع أي سطر من غير مقاس — نفس درس خسارة الـ 100).
 *   - الخروج/الدخول بيحصل على الـ variant نفسه بـ UPDATE ذري مشروط
 *     (quantity gte qty للخروج — المخزون ماينزلش تحت الصفر مهما حصل)،
 *     وكمية المنتج بتتزامن من مجموع المقاسات (syncProductQuantityFromVariants)
 *     بدل أي تعديل مباشر على Product.quantity — عشان أول مزامنة ماتمسحش الحركة.
 *   - التكلفة من مستوى المنتج (المتوسط المرجح) — الـ variant ملوش تكلفة لوحده.
 */

interface ExchangeLine {
  productId: number
  /** 🎨 للمنتجات ذات الألوان/المقاسات — إجباري وساعتها، وممنوع للمنتجات البسيطة */
  variantId: number | null
  quantity: number
}

/** تسمية اللون/المقاس لعرضها في الرسائل وحركات المخزون */
const variantLabel = (v: { color: string | null; size: string | null } | null | undefined) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') : ''

export async function POST(req: NextRequest) {
  return withIdempotency(req, () => __POST(req))
}

async function __POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const b = await req.json().catch(() => null)
  const supplierId = parseInt(b?.supplierId, 10)
  if (!supplierId) {
    return NextResponse.json({ error: 'اختار المورد أولاً' }, { status: 400 })
  }

  const reason = b?.note ? String(b.note).trim() : ''
  if (reason.length < 3) {
    return NextResponse.json({ error: 'اكتب سبب الاستبدال (إجباري)' }, { status: 400 })
  }

  // تحويل الأسطر والتحقق الأساسي (مع دمج المكرر product+variant)
  const parseLines = (raw: any): ExchangeLine[] => {
    if (!Array.isArray(raw)) return []
    const merged = new Map<string, ExchangeLine>()
    for (const l of raw) {
      const productId = parseInt(l?.productId, 10)
      const rawVariant = l?.variantId
      const variantId = rawVariant === null || rawVariant === undefined || rawVariant === ''
        ? null
        : parseInt(rawVariant, 10)
      // 🥬 2026-10-12: الكمية Float — استبدال بالوزن (مرتجع 1.5 كيلو وبديل 1.2)
      const quantity = Math.round((Number(l?.quantity) || 0) * 1000) / 1000
      if (!Number.isInteger(productId) || quantity <= 0) continue
      if (rawVariant !== null && rawVariant !== undefined && rawVariant !== '' && !Number.isInteger(variantId)) continue
      const key = `${productId}:${variantId ?? 0}`
      const prev = merged.get(key)
      if (prev) prev.quantity = Math.round((prev.quantity + quantity) * 1000) / 1000
      else merged.set(key, { productId, variantId, quantity })
    }
    return [...merged.values()]
  }
  const outLines = parseLines(b?.lines) // البضاعة الراجعة للمورد
  const inLines = parseLines(b?.replacements) // البضاعة البديلة

  if (outLines.length === 0 || inLines.length === 0) {
    return NextResponse.json(
      { error: 'لازم تحدد البضاعة الراجعة والبضاعة البديلة على الأقل صنف في كل جانب' },
      { status: 400 },
    )
  }

  // المورد لازم يبقى تابع لنفس المحل
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier || supplier.tenantId !== s.tenantId) {
    return NextResponse.json({ error: 'المورد غير صالح' }, { status: 400 })
  }

  // تحميل كل الأصناف المطلوبة (الجانبين) بنطاق المحل
  const allIds = [...new Set([...outLines, ...inLines].map((l) => l.productId))]
  const products = await db.product.findMany({
    where: { id: { in: allIds }, tenantId: s.tenantId },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))
  for (const l of [...outLines, ...inLines]) {
    const p = productMap.get(l.productId)
    if (!p) {
      return NextResponse.json({ error: `صنف غير موجود (#${l.productId})` }, { status: 400 })
    }
    if (s.branchId && p.branchId && p.branchId !== s.branchId) {
      return NextResponse.json({ error: `لا صلاحية على الصنف "${p.name}" (فرع آخر)` }, { status: 403 })
    }
  }

  // 🎨 التحقق من المقاسات: منتج له مقاسات → السطر لازم يجي بمقاس تابع له،
  // ومنتج بسيط → ممنوع يجي بمقاس. (نفس الرفض السيرفري اللي في الشراء)
  const variantIds = [...new Set(
    [...outLines, ...inLines].map((l) => l.variantId).filter((v): v is number => v != null),
  )]
  const variants = variantIds.length
    ? await db.productVariant.findMany({ where: { id: { in: variantIds } } })
    : []
  const variantMap = new Map(variants.map((v) => [v.id, v]))

  for (const l of [...outLines, ...inLines]) {
    const p = productMap.get(l.productId)!
    const v = l.variantId != null ? variantMap.get(l.variantId) : null
    if (l.variantId != null) {
      if (!v || v.productId !== l.productId) {
        return NextResponse.json(
          { error: `المقاس المحدد غير صالح للصنف "${p.name}" — اختار اللون/المقاس من القائمة` },
          { status: 400 },
        )
      }
    } else {
      const hasVariants = await db.productVariant.count({ where: { productId: p.id } })
      if (hasVariants > 0) {
        return NextResponse.json(
          { error: `الصنف "${p.name}" له ألوان ومقاسات — لازم تحدد اللون/المقاس لكل سطر عشان الكمية ما تتمسحش` },
          { status: 400 },
        )
      }
    }
  }

  // فحص توفر الكميات الخارجة (فحص مبدئي للرسالة اللطيفة — الفحص الذري جوه الـ tx)
  for (const l of outLines) {
    if (l.variantId != null) {
      const v = variantMap.get(l.variantId)!
      if (v.quantity < l.quantity) {
        return NextResponse.json(
          { error: `الكمية غير متوفرة من "${productMap.get(l.productId)!.name}" (${variantLabel(v)}) — المتاح: ${v.quantity}` },
          { status: 400 },
        )
      }
    } else {
      const p = productMap.get(l.productId)!
      if (p.quantity < l.quantity) {
        return NextResponse.json(
          { error: `الكمية غير متوفرة من "${p.name}" (المتاح: ${p.quantity})` },
          { status: 400 },
        )
      }
    }
  }

  // قيم التكلفة الحالية (المتوسط المرجح — من مستوى المنتج)
  const costOf = (pid: number) => Math.max(0, productMap.get(pid)?.cost ?? 0)
  const nameOf = (pid: number) => productMap.get(pid)?.name ?? `#${pid}`
  const valueOut = round2(outLines.reduce((sum, l) => sum + costOf(l.productId) * l.quantity, 0))
  const valueIn = round2(inLines.reduce((sum, l) => sum + costOf(l.productId) * l.quantity, 0))
  const diff = round2(valueIn - valueOut)

  try {
    const result = await db.$transaction(async (tx) => {
      // ── 1. الصادر: البضاعة الراجعة للمورد (خروج ذري مشروط بالتوفر)
      for (const l of outLines) {
        if (l.variantId != null) {
          // 🎨 الخروج من المقاس نفسه بـ UPDATE ذري مشروط — لو حد باع/سحب من
          // نفس المقاس في نفس اللحظة العملية كلها بترجع للوراء.
          const vOut = await tx.productVariant.updateMany({
            where: { id: l.variantId, productId: l.productId, quantity: { gte: l.quantity } },
            data: { quantity: { decrement: l.quantity } },
          })
          if (vOut.count !== 1) {
            throw new Error(`INSUFFICIENT_VARIANT_STOCK:${l.variantId}`)
          }
          // كمية المنتج بتتزامن دايماً من مجموع المقاسات — مفيش أي تعديل مباشر
          await syncProductQuantityFromVariants(tx, l.productId)
        } else {
          const upd = await tx.product.updateMany({
            where: { id: l.productId, tenantId: s.tenantId, quantity: { gte: l.quantity } },
            data: { quantity: { decrement: l.quantity } },
          })
          if (upd.count !== 1) {
            throw new Error(`INSUFFICIENT_STOCK:${l.productId}`)
          }
        }
        const v = l.variantId != null ? variantMap.get(l.variantId) : null
        const lineName = v
          ? `${nameOf(l.productId)} (${variantLabel(v)})`
          : nameOf(l.productId)
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId,
            branchId: productMap.get(l.productId)?.branchId ?? (s.branchId ?? null),
            productId: l.productId,
            variantId: l.variantId,
            type: 'out',
            quantity: -l.quantity,
            refType: 'supplier_exchange',
            refId: supplierId,
            note: `استبدال مع مورد ${supplier.name} — ${lineName} × ${l.quantity} — ${reason}`,
            userId: s.userId,
          },
        })
      }

      // ── 2. الوارد: البضاعة البديلة (دخول — التكلفة متتغيرش: مقايضة مش شراء جديد)
      for (const l of inLines) {
        if (l.variantId != null) {
          const vIn = await tx.productVariant.updateMany({
            where: { id: l.variantId, productId: l.productId },
            data: { quantity: { increment: l.quantity } },
          })
          if (vIn.count !== 1) {
            throw new Error(`INSUFFICIENT_VARIANT_STOCK:${l.variantId}`)
          }
          await syncProductQuantityFromVariants(tx, l.productId)
        } else {
          await tx.product.update({
            where: { id: l.productId },
            data: { quantity: { increment: l.quantity } },
          })
        }
        const v = l.variantId != null ? variantMap.get(l.variantId) : null
        const lineName = v
          ? `${nameOf(l.productId)} (${variantLabel(v)})`
          : nameOf(l.productId)
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId,
            branchId: productMap.get(l.productId)?.branchId ?? (s.branchId ?? null),
            productId: l.productId,
            variantId: l.variantId,
            type: 'in',
            quantity: l.quantity,
            refType: 'supplier_exchange',
            refId: supplierId,
            note: `بديل من مورد ${supplier.name} — ${lineName} × ${l.quantity} — ${reason}`,
            userId: s.userId,
          },
        })
      }

      // ── 3. فرق القيمة على حساب المورد
      let supplierBalance: number | null = null
      if (diff !== 0) {
        const sup = await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: diff } },
          select: { balance: true },
        })
        supplierBalance = sup.balance
      }

      return { valueOut, valueIn, diff, supplierBalance }
    }, { maxWait: 10000, timeout: 20000 })

    return NextResponse.json({
      ok: true,
      valueOut: result.valueOut,
      valueIn: result.valueIn,
      diff: result.diff,
      supplierBalance: result.supplierBalance,
      message:
        result.diff === 0
          ? 'تم الاستبدال (قيمة متكافئة — مفيش أثر على حساب المورد)'
          : result.diff > 0
            ? `تم الاستبدال — زيادة قيمة ${result.diff} اتحملت على حساب المورد`
            : `تم الاستبدال — قيمة ${Math.abs(result.diff)} بقت رصيد لك عند المورد`,
    })
  } catch (e: any) {
    if (e instanceof Error && e.message.startsWith('INSUFFICIENT_STOCK')) {
      // رسالة مفصلة حسب نوع الفشل (منتج بسيط أم مقاس معين)
      if (e.message.startsWith('INSUFFICIENT_VARIANT_STOCK:')) {
        const vid = parseInt(e.message.split(':')[1] || '0', 10)
        const v = variantMap.get(vid)
        const vn = v ? `${productMap.get(v.productId)?.name ?? ''} (${variantLabel(v)})` : 'اللون/المقاس'
        return NextResponse.json(
          { error: `الكمية غير متوفرة من "${vn}" — حدّث الصفحة وحاول تاني` },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: 'كمية من البضاعة الراجعة باعت أثناء العملية — حدّث الصفحة وحاول تاني' },
        { status: 409 },
      )
    }
    throw e
  }
}
