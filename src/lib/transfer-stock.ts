import type { Prisma } from '@prisma/client'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'

/**
 * 🏬 2026-10-18 — منطق تنفيذ بند تحويل واحد بين فرعين (مشترك بين «تحويل مباشر»
 * و«تنفيذ تحويل معلّق» عشان ما يختلفوش عن بعض تاني).
 *
 * اللي بيعمله لكل بند:
 *  1) خصم ذري من المصدر مشروط بالتوفر (المخزون مستحيل يبقى سالب).
 *     - منتج له ألوان/مقاسات: الخصم من الـ variant نفسه وكمية المنتج = مجموعهم.
 *  2) إيجاد/إنشاء نسخة المنتج في الفرع الوجهة — بنفس *الباركود* (الباركود فريد
 *     لكل فرع، فالنسخة بتتلاقي بالمسح) — وتكملة الباركود لو نسخة قديمة اتعملت
 *     من غيره.
 *  3) منتج له مقاسات: إيجاد/إنشاء نفس اللون/المقاس في الوجهة (بباركوده لو
 *     مفيش تعارض) وإضافة الكمية عليه.
 *  4) حركتين في دفتر المخزون (transfer_out / transfer_in) بالـ variantId.
 */

export class TransferStockError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type Tx = Prisma.TransactionClient

export interface TransferCtx {
  tenantId: string
  userId: string | null | undefined
  transferId: number
  from: { id: number; name: string }
  to: { id: number; name: string }
}

export interface TransferLine {
  productId: number
  variantId: number | null
  quantity: number
}

const labelOf = (v: { color: string | null; size: string | null; id: number }) =>
  [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`

/**
 * تحقق مشترك (قبل أي كتابة) من إن كل بند مكتوب صح بالنسبة للمقاسات:
 * منتج له variants → variantId إجباري وتابع للمنتج، ومنتج مالوش → مفيش variantId.
 * بيرجّع نص الخطأ العربي أو null.
 */
export async function validateVariantLines(
  db: Tx | import('@prisma/client').PrismaClient,
  tenantId: string,
  lines: Array<{ productId: number; variantId: number | null; quantity: number }>,
): Promise<string | null> {
  const ids = [...new Set(lines.map((l) => l.productId))]
  const products = await db.product.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, name: true },
  })
  const pMap = new Map(products.map((p) => [p.id, p.name]))
  const variants = await db.productVariant.findMany({
    where: { productId: { in: ids } },
    select: { id: true, productId: true, color: true, size: true },
  })
  const byProduct = new Map<number, typeof variants>()
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v])
  for (const l of lines) {
    const name = pMap.get(l.productId)
    if (!name) return 'منتج غير صالح'
    const pv = byProduct.get(l.productId) ?? []
    if (pv.length > 0) {
      const v = pv.find((x) => x.id === l.variantId)
      if (!v) {
        return l.variantId == null
          ? `المنتج "${name}" له ألوان ومقاسات — حدّد اللون والمقاس`
          : `اللون/المقاس غير تابع للمنتج "${name}"`
      }
      if (!Number.isInteger(l.quantity)) return `كمية غير صالحة للمنتج "${name}" — لازم عدد صحيح`
    } else if (l.variantId != null) {
      return `المنتج "${name}" ليس له ألوان أو مقاسات`
    }
  }
  return null
}

export async function applyTransferItem(tx: Tx, ctx: TransferCtx, line: TransferLine): Promise<void> {
  const { tenantId } = ctx
  const qty = line.quantity
  if (!(qty > 0)) throw new TransferStockError('كمية غير صالحة')

  const src = await tx.product.findUnique({ where: { id: line.productId } })
  if (!src || src.tenantId !== tenantId) throw new TransferStockError('منتج غير صالح')

  // ── 1) خصم ذري من المصدر ───────────────────────────────────────────────
  let srcVariant: { id: number; color: string | null; size: string | null; barcode: string | null } | null = null
  if (line.variantId != null) {
    srcVariant = await tx.productVariant.findFirst({
      where: { id: line.variantId, productId: src.id },
      select: { id: true, color: true, size: true, barcode: true },
    })
    if (!srcVariant) throw new TransferStockError('لون/مقاس غير صالح')
    // 👕 الخصم من المعروض الأول والباقي من المخزن الداخلي
    const dec = await tx.$executeRaw`
      UPDATE "ProductVariant"
      SET "quantity" = "quantity" - ${qty},
          "displayQty" = GREATEST(0, "displayQty" - LEAST(${qty}, "displayQty"))
      WHERE "id" = ${srcVariant.id} AND "productId" = ${src.id} AND "quantity" >= ${qty}`
    if (dec !== 1) {
      throw new TransferStockError(`الكمية غير متوفرة (${src.name} — ${labelOf(srcVariant)})`, 409)
    }
    await syncProductQuantityFromVariants(tx, src.id)
  } else {
    // 👕 الخصم من المعروض الأول والباقي من المخزن الداخلي
    const dec = await tx.$executeRaw`
      UPDATE "Product"
      SET "quantity" = "quantity" - ${qty},
          "displayQty" = GREATEST(0, "displayQty" - LEAST(${qty}, "displayQty"))
      WHERE "id" = ${src.id} AND "tenantId" = ${tenantId} AND "quantity" >= ${qty}`
    if (dec !== 1) throw new TransferStockError(`الكمية غير متوفرة (${src.name})`, 409)
  }
  const label = srcVariant ? labelOf(srcVariant) : null

  await tx.stockMovement.create({
    data: {
      tenantId,
      branchId: ctx.from.id,
      productId: src.id,
      variantId: srcVariant?.id ?? null,
      type: 'transfer_out',
      quantity: -qty,
      refType: 'transfer',
      refId: ctx.transferId,
      note: `تحويل إلى ${ctx.to.name}${label ? ` — ${label}` : ''}`,
      userId: ctx.userId,
    },
  })

  // ── 2) نسخة المنتج في الفرع الوجهة (بنفس الباركود) ───────────────────────
  // الأولوية للباركود (نفس المنتج بالضبط) وبعدين الاسم.
  let dest =
    (src.barcode
      ? await tx.product.findFirst({ where: { tenantId, branchId: ctx.to.id, barcode: src.barcode } })
      : null) ??
    (await tx.product.findFirst({ where: { tenantId, branchId: ctx.to.id, name: src.name } }))

  if (!dest) {
    dest = await tx.product.create({
      data: {
        tenantId,
        branchId: ctx.to.id,
        name: src.name,
        category: src.category,
        barcode: src.barcode, // ✅ الباركود فريد لكل فرع — النسخة بتتلاقي بالمسح
        price: src.price,
        cost: src.cost,
        quantity: 0,
        minQuantity: src.minQuantity,
        imagePath: src.imagePath,
        collection: src.collection,
        soldByWeight: src.soldByWeight,
        unitLabel: src.unitLabel,
        retailMarginPercent: src.retailMarginPercent,
        season: src.season, // 👕 الموسم بيتنقل مع النسخة
      },
    })
  } else if (!dest.barcode && src.barcode) {
    // نسخة قديمة اتعملت من غير باركود → نكمّلها (لو مفيش منتج تاني في الوجهة بيستخدمه)
    const taken = await tx.product.findFirst({
      where: { tenantId, branchId: ctx.to.id, barcode: src.barcode },
      select: { id: true },
    })
    if (!taken) {
      dest = await tx.product.update({ where: { id: dest.id }, data: { barcode: src.barcode } })
    }
  }

  // ── 2.5) وحدات الجملة (ربع دستة / نصف / دستة / دستة ونص ...) ─────────────────
  // لو نسخة الوجهة مالهاش أي وحدات بنكوّبي وحدات المصدر (الاسم/المعامل/السعر/التفعيل).
  // لو ليها وحدات بنسيبها زي ما هي (ممكن التاجر عدّلها أو مسح منها قصداً).
  // باركود الوحدة مابيتنسخش (فريد على مستوى النظام ومش مستخدم في البيع).
  const srcUnits = await tx.productUnit.findMany({
    where: { productId: src.id },
    select: { name: true, price: true, factor: true, active: true },
  })
  if (srcUnits.length > 0) {
    const destUnits = await tx.productUnit.count({ where: { productId: dest.id } })
    if (destUnits === 0) {
      await tx.productUnit.createMany({
        data: srcUnits.map((u) => ({ productId: dest!.id, name: u.name, price: u.price, factor: u.factor, active: u.active })),
        skipDuplicates: true,
      })
    }
  }

  // ── 3) الإضافة على الوجهة ────────────────────────────────────────────────
  let destVariantId: number | null = null
  if (srcVariant) {
    let dv = await tx.productVariant.findFirst({
      where: { productId: dest.id, color: srcVariant.color, size: srcVariant.size },
    })
    if (!dv) {
      // باركود المقاس: نفس باركود المصدر لو مش مستخدم في الوجهة، وإلا من غير باركود
      let vBarcode: string | null = srcVariant.barcode
      if (vBarcode) {
        const taken = await tx.productVariant.findFirst({
          where: { barcode: vBarcode, product: { tenantId, branchId: ctx.to.id } },
          select: { id: true },
        })
        if (taken) vBarcode = null
      }
      dv = await tx.productVariant.create({
        data: { productId: dest.id, color: srcVariant.color, size: srcVariant.size, barcode: vBarcode, quantity: 0 },
      })
    }
    // 👕 البضاعة الواصلة بتتعمل معروضة (زي الشراء) — والتقسيمة بقت حاجة الحركة تظبطها
    await tx.productVariant.update({ where: { id: dv.id }, data: { quantity: { increment: qty }, displayQty: { increment: qty } } })
    await syncProductQuantityFromVariants(tx, dest.id)
    destVariantId = dv.id
  } else {
    await tx.product.update({ where: { id: dest.id }, data: { quantity: { increment: qty }, displayQty: { increment: qty } } })
  }

  await tx.stockMovement.create({
    data: {
      tenantId,
      branchId: ctx.to.id,
      productId: dest.id,
      variantId: destVariantId,
      type: 'transfer_in',
      quantity: qty,
      refType: 'transfer',
      refId: ctx.transferId,
      note: `تحويل من ${ctx.from.name}${label ? ` — ${label}` : ''}`,
      userId: ctx.userId,
    },
  })
}
