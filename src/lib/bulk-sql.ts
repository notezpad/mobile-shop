import type postgres from 'postgres'
import type { Sql } from '@/lib/sql'

/** العميل جوه sql.begin(...) — نوع منفصل عن Sql في postgres.js */
type Tx = postgres.TransactionSql

/**
 * ⚡ 2026-10-22 — عمليات المنتجات الجماعية بـ SQL مجمّع (set-based).
 * ─────────────────────────────────────────────────────────────────────────────
 * المشكلة اللي بيحلها: الاستيراد وإغلاق/فتح الموسم كانوا بيلفّوا على كل منتج
 * ويعملوا 3–5 استعلامات Prisma لكل واحد (category.findFirst + product.create +
 * productUnit.createMany + stockMovement.create ...). ١٠٠٠ منتج = ~٤٥٠٠
 * استعلام Prisma جوه Worker واحد — وكل استعلام Prisma على workerd بيعدّي من
 * query compiler (WASM) + تحويل نتايج، يعني CPU عالي + ضغط على الداتابيز.
 *
 * الحل: كل مجموعة صفوف بتتبعت كـ JSON واحد (باراميتر واحد) والداتابيز نفسها
 * بتفكّه بـ jsonb_to_recordset وتنفّذ INSERT/UPDATE واحد للكل. عدد الاستعلامات
 * بقى ثابت تقريبًا (مش بيزيد مع عدد المنتجات) واستهلاك الـ Worker بيبقى
 * JSON.stringify واحد.
 *
 * ليه JSON مش مصفوفات؟ sql.ts مظبوط على fetch_types:false (عشان CPU) — يعني
 * مفيش serializer لأنواع المصفوفات. باراميتر jsonb واحد شغال من غير ده.
 *
 * ⚠️ لازم sql.json(...) مش JSON.stringify(...): مع ::jsonb بيتعمل JSON-encode
 * تاني للنص (يطلع «نص» جوه jsonb مش مصفوفة) → "cannot call jsonb_to_recordset
 * on a non-array". اتكشفت في الاختبار على Postgres حقيقي.
 *
 * ⚠️ الملف ده ممنوع يستورد Prisma (نفس قاعدة sql.ts).
 */

/** حجم الدفعة الواحدة — كل دفعة = استعلام واحد atomic (كله أو لا شيء) */
export const BULK_CHUNK = 500

// ═════════════════════════════════════════════════════════════════════════════
// 1) الاستيراد
// ═════════════════════════════════════════════════════════════════════════════

export interface NewProductRow {
  name: string
  category: string | null
  barcode: string | null
  price: number
  cost: number
  qty: number
  minQuantity: number
  season: string
  displayQty: number
  unitLabel: string | null
}

export interface ImportCtx {
  tenantId: string
  branchId: number | null
  userId: string | null
}

/**
 * إنشاء مجموعة منتجات جديدة (+ تصنيفاتها + الوحدات الافتراضية + حركة الرصيد
 * الافتتاحي) في **استعلام واحد**. الاستعلام الواحد في Postgres atomic بطبيعته،
 * فمفيش محتاجين BEGIN/COMMIT صريحين.
 *
 * الـ ids بتتولّد جوه الاستعلام نفسه بـ nextval ويتشاركها الـ CTEs
 * (CTE بيها دالة volatile بيتنفّذ مرة واحدة) — فالحركات والوحدات بتتربط
 * بالمنتج الصح من غير رحلة تانية للداتابيز.
 */
export async function insertProductsBulk(
  sql: Sql,
  ctx: ImportCtx & { withDefaultUnits: boolean },
  rows: NewProductRow[],
): Promise<number> {
  if (rows.length === 0) return 0
  const json = sql.json(rows as never)
  const res = await sql<{ created: number }[]>`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS x(
        "name" text, "category" text, "barcode" text, "price" float8, "cost" float8,
        "qty" float8, "minQuantity" float8, "season" text, "displayQty" float8, "unitLabel" text
      )
    ),
    ids AS (
      SELECT nextval(pg_get_serial_sequence('"Product"', 'id'))::int AS "id", i.*
      FROM input i
    ),
    cats AS (
      INSERT INTO "Category" ("tenantId", "name")
      SELECT DISTINCT ${ctx.tenantId}::text, btrim("category") FROM input
      WHERE "category" IS NOT NULL AND btrim("category") <> ''
      ON CONFLICT ("tenantId", "name") DO NOTHING
      RETURNING 1
    ),
    prod AS (
      INSERT INTO "Product" (
        "id", "tenantId", "branchId", "name", "category", "barcode", "price", "cost",
        "quantity", "minQuantity", "soldByWeight", "season", "displayQty", "unitLabel"
      )
      SELECT "id", ${ctx.tenantId}::text, ${ctx.branchId}::int, "name", NULLIF(btrim("category"), ''),
             "barcode", COALESCE("price", 0), COALESCE("cost", 0), COALESCE("qty", 0),
             COALESCE("minQuantity", 1), false, "season", COALESCE("displayQty", 0), "unitLabel"
      FROM ids
      RETURNING 1
    ),
    units AS (
      INSERT INTO "ProductUnit" ("productId", "name", "factor", "price")
      SELECT ids."id", u."name", u."factor", round((COALESCE(ids."price", 0) * u."factor")::numeric, 2)::float8
      FROM ids
      CROSS JOIN (VALUES ('ربع دستة', 3), ('نص دستة', 6), ('دستة', 12), ('دستة و نص', 18)) AS u("name", "factor")
      WHERE ${ctx.withDefaultUnits}::boolean
      RETURNING 1
    ),
    mv AS (
      INSERT INTO "StockMovement" ("tenantId", "branchId", "productId", "type", "quantity", "refType", "note", "userId")
      SELECT ${ctx.tenantId}::text, ${ctx.branchId}::int, "id", 'in', "qty", 'manual',
             'رصيد افتتاحي (استيراد Excel)', ${ctx.userId}::text
      FROM ids WHERE COALESCE("qty", 0) > 0
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM prod)::int AS "created"`
  return Number(res[0]?.created ?? 0)
}

export interface MergeRow {
  id: number
  qty: number
  setPrice: number | null
  setCost: number | null
  /** المنتج كان موقوف ورجع في الاستيراد → يتفعّل */
  reactivate: boolean
}

/**
 * دمج كميات في منتجات موجودة: UPDATE واحد + حركة «in» لكل منتج في نفس الاستعلام.
 * نفس سلوك الكود القديم بالظبط (الكمية بتزيد، السعر/التكلفة بس في وضع update،
 * وdisplayQty ماتتلمسش).
 */
export async function mergeQuantitiesBulk(
  sql: Sql,
  ctx: ImportCtx,
  rows: MergeRow[],
): Promise<{ merged: number; qty: number }> {
  if (rows.length === 0) return { merged: 0, qty: 0 }
  const json = sql.json(rows as never)
  const res = await sql<{ merged: number; qty: number }[]>`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS x(
        "id" int, "qty" float8, "setPrice" float8, "setCost" float8, "reactivate" boolean
      )
    ),
    upd AS (
      UPDATE "Product" p SET
        "quantity" = p."quantity" + i."qty",
        "active"   = p."active" OR COALESCE(i."reactivate", false),
        "price"    = COALESCE(i."setPrice", p."price"),
        "cost"     = COALESCE(i."setCost", p."cost")
      FROM input i
      WHERE p."id" = i."id" AND p."tenantId" = ${ctx.tenantId}::text
      RETURNING p."id", p."branchId", i."qty"
    ),
    mv AS (
      INSERT INTO "StockMovement" ("tenantId", "branchId", "productId", "type", "quantity", "refType", "note", "userId")
      SELECT ${ctx.tenantId}::text, u."branchId", u."id", 'in', u."qty", 'manual',
             'رصيد افتتاحي (استيراد Excel — دمج كمية)', ${ctx.userId}::text
      FROM upd u WHERE u."qty" > 0
      RETURNING 1
    )
    SELECT count(*)::int AS "merged", COALESCE(sum("qty"), 0)::float8 AS "qty" FROM upd`
  return { merged: Number(res[0]?.merged ?? 0), qty: Number(res[0]?.qty ?? 0) }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) المواسم (المخزن الداخلي)
// ═════════════════════════════════════════════════════════════════════════════

const WAREHOUSE_IN = 'warehouse_in'
const WAREHOUSE_OUT = 'warehouse_out'

const roundQty = (n: number) => Math.round(n * 1000) / 1000

/** خطأ متعمد بكود HTTP — نفس أسلوب الكود القديم (err.status) */
export class SeasonError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function parseClosed(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? '[]')
    return Array.isArray(arr) ? [...new Set(arr.filter((s) => s === 'SUMMER' || s === 'WINTER'))] : []
  } catch {
    return []
  }
}

/** قفل صف المحل + تحديث «المواسم المقفولة» — جوه نفس المعاملة (ضد تزامن إغلاق/فتح) */
async function lockAndSyncClosedSeasons(tx: Tx, tenantId: string, season: string, closing: boolean) {
  const rows = await tx<{ closedSeasons: string | null }[]>`
    SELECT "closedSeasons" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
  const current = parseClosed(rows[0]?.closedSeasons)
  const next = closing
    ? current.includes(season) ? current : [...current, season]
    : current.filter((x) => x !== season)
  if (JSON.stringify(next) === JSON.stringify(current)) return
  await tx`UPDATE "Tenant" SET "closedSeasons" = ${JSON.stringify(next)} WHERE "id" = ${tenantId}`
}

export interface SeasonCtx {
  tenantId: string
  userId: string | null
  season: string
  label: string
}

/**
 * إغلاق الموسم: كل المعروض من أصناف الموسم بيدخل المخزن الداخلي.
 * ٣ استعلامات ثابتة (قفل + تحديد + تنفيذ) بدل ٢–٣ لكل منتج.
 */
export async function closeSeasonBulk(sql: Sql, ctx: SeasonCtx): Promise<{ products: number; pieces: number }> {
  return (await sql.begin(async (tx) => {
    // FOR UPDATE = حماية من بيع متوازي أثناء الترحيل (قفل على الصفوف)
    const targets = await tx<{ id: number; branchId: number | null; displayQty: number }[]>`
      SELECT p."id", p."branchId", p."displayQty"
      FROM "Product" p
      WHERE p."tenantId" = ${ctx.tenantId} AND p."active" = true AND p."season" = ${ctx.season}
        AND p."displayQty" > 0
      ORDER BY p."id"
      FOR UPDATE`

    const moved: { id: number; branchId: number | null; qty: number; note: string }[] = []
    let pieces = 0
    for (const p of targets) {
      const qty = roundQty(Number(p.displayQty))
      if (qty <= 0) continue
      moved.push({
        id: Number(p.id),
        branchId: p.branchId == null ? null : Number(p.branchId),
        qty,
        note: `إغلاق الموسم (${ctx.label}) — نقل ${qty} للمخزن الداخلي`,
      })
      pieces += qty
    }

    if (moved.length > 0) {
      const json = tx.json(moved as never)
      await tx`
        WITH input AS (
          SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS x(
            "id" int, "branchId" int, "qty" float8, "note" text
          )
        ),
        vz AS (
          UPDATE "ProductVariant" v SET "displayQty" = 0
          FROM input i WHERE v."productId" = i."id" AND v."displayQty" > 0
          RETURNING 1
        ),
        pz AS (
          UPDATE "Product" p SET "displayQty" = 0
          FROM input i WHERE p."id" = i."id" AND p."displayQty" > 0
          RETURNING 1
        )
        INSERT INTO "StockMovement" ("tenantId", "branchId", "productId", "type", "quantity", "refType", "note", "userId")
        SELECT ${ctx.tenantId}::text, i."branchId", i."id", ${WAREHOUSE_IN}::text, i."qty", 'season', i."note", ${ctx.userId}::text
        FROM input i`
    }
    await lockAndSyncClosedSeasons(tx, ctx.tenantId, ctx.season, true)
    return { products: moved.length, pieces: roundQty(pieces) }
  })) as { products: number; pieces: number }
}

/**
 * فتح الموسم: إرجاع كميات محددة للعرض. نفس رسايل الأخطاء وأكواد الـ HTTP
 * القديمة بالظبط (400/404/409) — لكن بتتحقق من كل الأصناف بقراءة واحدة
 * وتنفّذ في تحديثات مجمّعة. أي خطأ = rollback كامل.
 */
export async function openSeasonBulk(
  sql: Sql,
  ctx: SeasonCtx,
  rawItems: unknown[],
): Promise<{ products: number; pieces: number }> {
  // ── 1) تنظيف المدخلات (نفس رسالة الخطأ القديمة) + دمج الأصناف المكررة ──
  const wanted = new Map<number, number>()
  for (const raw of rawItems as { productId?: unknown; qty?: unknown }[]) {
    const pid = parseInt(String(raw?.productId ?? ''), 10)
    const qty = roundQty(Number(raw?.qty) || 0)
    if (!pid || qty <= 0) throw new SeasonError('كمية غير صالحة لأحد الأصناف', 400)
    wanted.set(pid, roundQty((wanted.get(pid) ?? 0) + qty))
  }
  const ids = [...wanted.keys()]

  return (await sql.begin(async (tx) => {
    // ── 2) قراءة واحدة + قفل صفوف كل الأصناف ──
    const found = await tx<
      { id: number; name: string; branchId: number | null; quantity: number; displayQty: number; active: boolean; variantCount: number }[]
    >`
      SELECT p."id", p."name", p."branchId", p."quantity", p."displayQty", p."active",
             (SELECT COUNT(*)::int FROM "ProductVariant" v WHERE v."productId" = p."id") AS "variantCount"
      FROM "Product" p
      WHERE p."tenantId" = ${ctx.tenantId} AND p."id" IN ${tx(ids)}
      ORDER BY p."id"
      FOR UPDATE OF p`
    const byId = new Map(found.map((r) => [Number(r.id), r]))

    // ── 3) التحقق بنفس ترتيب الطلب (أول خطأ هو اللي يطلع) ──
    const plain: { id: number; qty: number }[] = []
    const withVariants: number[] = []
    const movements: { id: number; branchId: number | null; qty: number; note: string }[] = []
    let pieces = 0
    for (const [pid, qty] of wanted) {
      const p = byId.get(pid)
      if (!p || !p.active) throw new SeasonError('منتج غير موجود أو موقوف', 404)
      const whQty = roundQty(Number(p.quantity) - Number(p.displayQty))
      if (qty > whQty + 1e-9) {
        throw new SeasonError(`الكمية المطلوبة من «${p.name}» أكبر من اللي في المخزن الداخلي (المتاح: ${whQty})`, 400)
      }
      if (Number(p.variantCount) > 0) {
        // منتج بمقاسات: الفتح كله أو لا شيء
        if (Math.abs(qty - whQty) > 1e-9) {
          throw new SeasonError(`«${p.name}» له ألوان ومقاسات — بيتفتح كامل (${whQty}) أو مش بيتفتح`, 400)
        }
        withVariants.push(pid)
      } else {
        plain.push({ id: pid, qty })
      }
      movements.push({
        id: pid,
        branchId: p.branchId == null ? null : Number(p.branchId),
        qty,
        note: `فتح الموسم (${ctx.label}) — إرجاع ${qty} للعرض`,
      })
      pieces += qty
    }

    // ── 4) التنفيذ المجمّع ──
    if (withVariants.length > 0) {
      await tx`UPDATE "ProductVariant" SET "displayQty" = "quantity" WHERE "productId" IN ${tx(withVariants)}`
      await tx`UPDATE "Product" SET "displayQty" = "quantity" WHERE "id" IN ${tx(withVariants)}`
    }
    if (plain.length > 0) {
      // ⚛️ شرط ذري: لو أي صنف الكمية اتغيّرت بين الفحص والتحديث → 409 + rollback للكل
      const json = tx.json(plain as never)
      const upd = await tx<{ id: number }[]>`
        UPDATE "Product" p SET "displayQty" = p."displayQty" + i."qty"
        FROM jsonb_to_recordset(${json}::jsonb) AS i("id" int, "qty" float8)
        WHERE p."id" = i."id" AND (p."quantity" - p."displayQty") >= i."qty"
        RETURNING p."id"`
      if (upd.length !== plain.length) {
        const ok = new Set(upd.map((r) => Number(r.id)))
        const bad = plain.find((x) => !ok.has(x.id))
        const name = (bad && byId.get(bad.id)?.name) || ''
        throw new SeasonError(`الكمية اتغيّرت أثناء العملية لـ«${name}» — حدّث الشاشة وحاول تاني`, 409)
      }
    }
    const mjson = tx.json(movements as never)
    await tx`
      INSERT INTO "StockMovement" ("tenantId", "branchId", "productId", "type", "quantity", "refType", "note", "userId")
      SELECT ${ctx.tenantId}::text, i."branchId", i."id", ${WAREHOUSE_OUT}::text, i."qty", 'season', i."note", ${ctx.userId}::text
      FROM jsonb_to_recordset(${mjson}::jsonb) AS i("id" int, "branchId" int, "qty" float8, "note" text)`

    // الفلتر الذكي: في أي فتح (حتى جزئي) الموسم بيرجع «شغال»
    await lockAndSyncClosedSeasons(tx, ctx.tenantId, ctx.season, false)
    return { products: movements.length, pieces: roundQty(pieces) }
  })) as { products: number; pieces: number }
}
