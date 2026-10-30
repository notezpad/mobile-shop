import type postgres from 'postgres'
import type { Sql } from '@/lib/sql'

type Tx = postgres.TransactionSql
type Q = Sql | Tx

/**
 * 🏬 الشراء الموزّع على فروع (منتجات عادية + منتجات بألوان/مقاسات).
 *
 * فاتورة واحدة بتتقسم لأمر شراء لكل فرع. كل فرع بيدخل مخزونه على صف المنتج بتاعه هو
 * (يتلاقى بالباركود ثم الاسم، ولو مش موجود بيتعمل نسخة بنفس المواصفات) — نفس منطق التحويلات.
 */

export const round2 = (x: number) => Math.round(x * 100 + Number.EPSILON) / 100
export const round3 = (x: number) => Math.round(x * 1000) / 1000

export interface SplitAllocation {
  branchId: number
  quantity: number
}
export interface SplitItem {
  productId: number
  /** اللون/المقاس في المنتج المصدر (null = منتج عادي) */
  variantId: number | null
  cost: number
  allocations: SplitAllocation[]
}

/** تحقق شكلي من بنود الطلب (من غير داتابيز). بيرجّع نص الخطأ العربي أو الأصناف المنضّفة. */
export function parseSplitItems(raw: unknown): { items: SplitItem[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'السلة فارغة' }
  const items: SplitItem[] = []
  const seenLines = new Set<string>()
  for (const r of raw as Record<string, unknown>[]) {
    const productId = parseInt(String(r?.productId), 10)
    if (!Number.isFinite(productId)) return { error: 'منتج غير موجود في السلة' }
    let variantId: number | null = null
    if (r.variantId != null && r.variantId !== '') {
      variantId = parseInt(String(r.variantId), 10)
      if (!Number.isFinite(variantId)) return { error: 'لون/مقاس غير صالح' }
    }
    const lineKey = `${productId}:${variantId ?? 0}`
    if (seenLines.has(lineKey)) return { error: 'نفس الصنف (أو نفس اللون/المقاس) مكرر في السلة — اجمع كمياته في بند واحد' }
    seenLines.add(lineKey)
    const cost = Number(r.cost)
    if (!Number.isFinite(cost) || cost < 0) return { error: 'سعر تكلفة غير صالح' }
    if (!Array.isArray(r.allocations) || r.allocations.length === 0) {
      return { error: 'حدّد الكمية لكل فرع' }
    }
    const seenBranches = new Set<number>()
    const allocations: SplitAllocation[] = []
    for (const a of r.allocations as Record<string, unknown>[]) {
      const branchId = parseInt(String(a?.branchId), 10)
      const quantity = round3(Number(a?.quantity))
      if (!Number.isFinite(branchId)) return { error: 'فرع غير صالح' }
      if (seenBranches.has(branchId)) return { error: 'نفس الفرع مكرر في توزيع صنف واحد' }
      seenBranches.add(branchId)
      if (!Number.isFinite(quantity) || quantity < 0) return { error: 'كمية غير صالحة' }
      // مخزون الألوان/المقاسات أعداد صحيحة
      if (variantId !== null && !Number.isInteger(quantity)) return { error: 'كمية الألوان والمقاسات لازم تكون أعداد صحيحة' }
      if (quantity > 0) allocations.push({ branchId, quantity })
    }
    if (allocations.length === 0) return { error: 'كل صنف لازم ياخد كمية في فرع واحد على الأقل' }
    items.push({ productId, variantId, cost, allocations })
  }
  return { items }
}

/**
 * قسمة المدفوع على الفروع بنسبة إجمالي كل فرع بطريقة «أكبر باقي» على القروش:
 * المجموع بالظبط = المدفوع، ومفيش نصيب بيطلع بالسالب مهما كان التقريب.
 */
export function splitPaid(totals: number[], paid: number): number[] {
  const sum = totals.reduce((a, b) => a + b, 0)
  if (totals.length === 0) return []
  if (paid <= 0 || sum <= 0) return totals.map(() => 0)
  const cents = Math.round(paid * 100)
  const raw = totals.map((t) => (cents * t) / sum)
  const floors = raw.map((r) => Math.floor(r + 1e-9))
  let left = cents - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((x, y) => y.frac - x.frac || x.i - y.i)
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k].i] += 1
  return floors.map((c) => c / 100)
}

export interface SrcProduct {
  id: number
  name: string
  category: string | null
  barcode: string | null
  price: number
  cost: number
  minQuantity: number
  imagePath: string | null
  collection: string | null
  soldByWeight: boolean
  unitLabel: string | null
  retailMarginPercent: number | null
  season: string
  branchId: number | null
}

export async function loadSrcProducts(q: Q, tenantId: string, ids: number[]): Promise<SrcProduct[]> {
  if (ids.length === 0) return []
  return (await (q as Sql)<SrcProduct[]>`
    SELECT "id", "name", "category", "barcode", "price", "cost", "minQuantity", "imagePath",
           "collection", "soldByWeight", "unitLabel", "retailMarginPercent", "season", "branchId"
    FROM "Product" WHERE "id" IN ${(q as Sql)(ids)} AND "tenantId" = ${tenantId}`) as unknown as SrcProduct[]
}

/** نسخة المنتج في فرع معين (بالباركود ثم الاسم) — قراءة بس. */
export async function findDestProduct(
  q: Q,
  tenantId: string,
  src: SrcProduct,
  mainBranchId: number,
  branchId: number,
): Promise<{ id: number; name: string } | null> {
  const sql = q as Sql
  // المنتج نفسه لو هو أصلاً تابع للفرع ده (غير المسند = الرئيسي)
  if ((src.branchId ?? mainBranchId) === branchId) return { id: src.id, name: src.name }
  // الفرع الرئيسي بيشمل المنتجات غير المسندة (branchId NULL)
  const branchCond = branchId === mainBranchId
    ? sql`("branchId" = ${branchId} OR "branchId" IS NULL)`
    : sql`"branchId" = ${branchId}`
  if (src.barcode) {
    const byBarcode = await sql<{ id: number; name: string }[]>`
      SELECT "id", "name" FROM "Product"
      WHERE "tenantId" = ${tenantId} AND ${branchCond} AND "barcode" = ${src.barcode} LIMIT 1`
    if (byBarcode[0]) return byBarcode[0]
  }
  const byName = await sql<{ id: number; name: string }[]>`
    SELECT "id", "name" FROM "Product"
    WHERE "tenantId" = ${tenantId} AND ${branchCond} AND "name" = ${src.name} LIMIT 1`
  return byName[0] ?? null
}

/** بيرجّع نسخة المنتج في الفرع، وينشئها (كمية صفر) لو مش موجودة. لازم يتنادى جوه transaction. */
export async function ensureDestProduct(
  tx: Tx,
  tenantId: string,
  src: SrcProduct,
  mainBranchId: number,
  branchId: number,
): Promise<number> {
  const found = await findDestProduct(tx, tenantId, src, mainBranchId, branchId)
  if (found) return found.id
  const created = await tx<{ id: number }[]>`
    INSERT INTO "Product"
      ("tenantId", "branchId", "name", "category", "barcode", "price", "cost", "quantity", "minQuantity",
       "imagePath", "collection", "soldByWeight", "unitLabel", "retailMarginPercent", "season", "displayQty")
    VALUES
      (${tenantId}, ${branchId}, ${src.name}, ${src.category}, ${src.barcode}, ${src.price}, ${src.cost}, 0,
       ${src.minQuantity}, ${src.imagePath}, ${src.collection}, ${src.soldByWeight}, ${src.unitLabel},
       ${src.retailMarginPercent}, ${src.season}, 0)
    RETURNING "id"`
  const destId = created[0].id
  // وحدات الجملة (دستة/نصف دستة...) — بدون باركود الوحدة (فريد على مستوى النظام)
  await tx`
    INSERT INTO "ProductUnit" ("productId", "name", "price", "factor", "active")
    SELECT ${destId}, "name", "price", "factor", "active" FROM "ProductUnit" WHERE "productId" = ${src.id}
    ON CONFLICT DO NOTHING`
  return destId
}

export interface SrcVariant {
  id: number
  productId: number
  color: string | null
  size: string | null
  barcode: string | null
}

export const variantLabel = (v: { color: string | null; size: string | null; id: number }) =>
  [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`

export async function loadSrcVariants(q: Q, productIds: number[]): Promise<SrcVariant[]> {
  if (productIds.length === 0) return []
  const sql = q as Sql
  return (await sql<SrcVariant[]>`
    SELECT "id", "productId", "color", "size", "barcode" FROM "ProductVariant"
    WHERE "productId" IN ${sql(productIds)} ORDER BY "id" ASC`) as unknown as SrcVariant[]
}

/** نسخة اللون/المقاس في منتج الوجهة (بنفس اللون والمقاس) — قراءة بس. */
export async function findDestVariant(
  q: Q,
  destProductId: number,
  src: { color: string | null; size: string | null },
): Promise<{ id: number } | null> {
  const sql = q as Sql
  const rows = await sql<{ id: number }[]>`
    SELECT "id" FROM "ProductVariant"
    WHERE "productId" = ${destProductId}
      AND "color" IS NOT DISTINCT FROM ${src.color}
      AND "size" IS NOT DISTINCT FROM ${src.size}
    LIMIT 1`
  return rows[0] ?? null
}

/** بيرجّع اللون/المقاس في منتج الوجهة، وينشئه (كمية صفر) لو مش موجود. جوه transaction. */
export async function ensureDestVariant(
  tx: Tx,
  tenantId: string,
  branchId: number,
  destProductId: number,
  src: SrcVariant,
): Promise<number> {
  const found = await findDestVariant(tx, destProductId, src)
  if (found) return found.id
  // باركود المقاس: نفس باركود المصدر لو مش مستخدم في الفرع، وإلا من غير باركود
  let barcode = src.barcode
  if (barcode) {
    const taken = await tx<{ id: number }[]>`
      SELECT v."id" FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
      WHERE v."barcode" = ${barcode} AND p."tenantId" = ${tenantId} AND COALESCE(p."branchId", 0) = ${branchId}
      LIMIT 1`
    if (taken.length > 0) barcode = null
  }
  const created = await tx<{ id: number }[]>`
    INSERT INTO "ProductVariant" ("productId", "color", "size", "barcode", "quantity", "displayQty")
    VALUES (${destProductId}, ${src.color}, ${src.size}, ${barcode}, 0, 0)
    RETURNING "id"`
  return created[0].id
}

/**
 * توافق منتج الوجهة مع نوع الصنف المشترى. بيرجّع نص الخطأ العربي أو null.
 *  - صنف بألوان/مقاسات ومنتج الوجهة عادي وعليه كمية: إضافة المقاسات كانت هتمسح كميته (كمية المنتج = مجموع المقاسات).
 *  - صنف عادي ومنتج الوجهة له ألوان/مقاسات: الدالة هترفض (لازم تحديد المقاس).
 */
export async function checkDestCompat(
  q: Q,
  destProductId: number,
  srcHasVariant: boolean,
  productName: string,
  branchName: string,
): Promise<string | null> {
  const sql = q as Sql
  const rows = await sql<{ quantity: number; variantCount: number }[]>`
    SELECT p."quantity"::float8 AS "quantity",
           (SELECT COUNT(*) FROM "ProductVariant" v WHERE v."productId" = p."id")::int AS "variantCount"
    FROM "Product" p WHERE p."id" = ${destProductId}`
  const d = rows[0]
  if (!d) return null
  if (srcHasVariant && d.variantCount === 0 && d.quantity > 0) {
    return `المنتج "${productName}" في ${branchName} عليه كمية (${d.quantity}) من غير ألوان ومقاسات — حدّد ألوانه ومقاساته الأول أو اشتريه هناك لوحده`
  }
  if (!srcHasVariant && d.variantCount > 0) {
    return `المنتج "${productName}" في ${branchName} له ألوان ومقاسات — اشتريه على الفرع ده لوحده`
  }
  return null
}
