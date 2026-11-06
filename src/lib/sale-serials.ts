/**
 * 🧾 src/lib/sale-serials.ts — سحب IMEI/السيريال تلقائيًا وقت البيع (2026-11-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * - assignSaleSerials: بعد حفظ الفاتورة، لكل سطر على متغير (variant) بنختار أقدم الأجهزة
 *   «بالمخزن» المسجلة للمتغير ده بعدد القطع المباعة، نعلّمها «تم بيعه» ونحفظ الـ IMEI
 *   على سطر الفاتورة (SaleItem.serials). كل ده في استعلام SQL واحد ذرّي.
 *   مفيش أجهزة مسجلة؟ مفيش أي تأثير والبيع يكمل عادي.
 * - releaseSaleItemUnits: عند المرتجع بنرجّع أحدث الأجهزة المرتبطة بالسطر للمخزن.
 *   (السيريال على الفاتورة القديمة بيفضل لقطة تاريخية.)
 */
import type { Sql } from '@/lib/sql'

/** يحوّل النص المحفوظ (سطر لكل جهاز) لمصفوفة */
export function splitSerials(s: string | null | undefined): string[] {
  return (s ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
}

export async function assignSaleSerials(sql: Sql, tenantId: string, sale: any): Promise<void> {
  if (!sale?.id || !Array.isArray(sale.items)) return
  const reqs = sale.items
    .filter((it: any) => it?.id && it.variantId && Number(it.quantity) >= 1)
    .map((it: any) => ({ itemId: Number(it.id), variantId: Number(it.variantId), qty: Math.floor(Number(it.quantity)) }))
  if (reqs.length === 0) return

  const rows = await sql<{ id: number; serials: string }[]>`
    WITH req AS (
      SELECT (e->>'itemId')::int AS "itemId",
             (e->>'variantId')::int AS "variantId",
             (e->>'qty')::int AS qty
      FROM jsonb_array_elements(${sql.json(reqs)}::jsonb) e
    ),
    req2 AS (
      SELECT *, COALESCE(SUM(qty) OVER (PARTITION BY "variantId" ORDER BY "itemId"
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS "startAt"
      FROM req
    ),
    ranked AS (
      SELECT u."id", u."variantId", u."imei",
             row_number() OVER (PARTITION BY u."variantId" ORDER BY u."id") AS rn
      FROM "VariantUnit" u
      WHERE u."tenantId" = ${tenantId}
        AND u."status" = 'in_stock'
        AND u."variantId" IN (SELECT "variantId" FROM req)
    ),
    pick AS (
      SELECT r."itemId", k."id" AS "unitId"
      FROM req2 r
      JOIN ranked k ON k."variantId" = r."variantId" AND k.rn > r."startAt" AND k.rn <= r."startAt" + r.qty
    ),
    upd AS (
      UPDATE "VariantUnit" u
      SET "status" = 'sold', "saleItemId" = p."itemId"
      FROM pick p
      WHERE u."id" = p."unitId" AND u."status" = 'in_stock' AND u."tenantId" = ${tenantId}
      RETURNING u."id", u."saleItemId", u."imei"
    ),
    agg AS (
      SELECT "saleItemId" AS "itemId", string_agg("imei", E'\n' ORDER BY "id") AS serials
      FROM upd GROUP BY "saleItemId"
    )
    UPDATE "SaleItem" i
    SET "serials" = a.serials
    FROM agg a
    WHERE i."id" = a."itemId" AND i."tenantId" = ${tenantId}
    RETURNING i."id", i."serials"`

  const byId = new Map(rows.map((r) => [Number(r.id), r.serials]))
  for (const it of sale.items) {
    const s = byId.get(Number(it.id))
    if (s) it.serials = s
  }
}

/** يرجّع أحدث `qty` جهاز مرتبطين بسطر الفاتورة للمخزن (مرتجع/استرداد). */
export async function releaseSaleItemUnits(
  tx: { $executeRaw: (q: TemplateStringsArray, ...v: any[]) => Promise<number> },
  tenantId: string,
  saleItemId: number,
  qty: number,
): Promise<void> {
  const n = Math.floor(qty)
  if (!(n >= 1)) return
  await tx.$executeRaw`
    UPDATE "VariantUnit"
    SET "status" = 'in_stock', "saleItemId" = NULL
    WHERE "id" IN (
      SELECT "id" FROM "VariantUnit"
      WHERE "saleItemId" = ${saleItemId} AND "tenantId" = ${tenantId}
      ORDER BY "id" DESC
      LIMIT ${n}
    )`
}
