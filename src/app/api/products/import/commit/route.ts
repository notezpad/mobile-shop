import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModuleWritePermission, featureErrorResponse, getPlanContext, UNLIMITED_PLAN_LIMIT, type PlanContext } from '@/lib/features'
import { withSql } from '@/lib/sql'
import { withIdempotency } from '@/lib/idempotency'
import { logAudit } from '@/lib/audit'
import { cleanUnitLabel, guessUnitLabel } from '@/lib/unit-label'
import { purgeCatalogCaches } from '@/lib/edgeCache'
import { applySecurityHeaders } from '@/lib/security-headers'
import { insertProductsBulk, mergeQuantitiesBulk, BULK_CHUNK, type NewProductRow, type MergeRow } from '@/lib/bulk-sql'
import { validateRows, importableRows, MAX_ROWS, type ImportField, type ParsedRow } from '@/lib/smart-import'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-10-22 — تنفيذ الاستيراد الذكي (الخطوة الأخيرة)
 *
 * ⚡ v2 (تقليل CPU): الكود القديم كان بيلفّ على كل منتج ويعمل 4–5 استعلامات Prisma
 * (category.findFirst + product.create + productUnit.createMany + stockMovement.create)
 * جوه transaction تفاعلية — ١٠٠٠ منتج ≈ ٤٥٠٠ استعلام Prisma في Worker واحد.
 * دلوقتي: استعلام SQL واحد لكل ٥٠٠ منتج (انظر src/lib/bulk-sql.ts) + مفيش Prisma خالص
 * في المسار ده (حتى التدقيق logAudit بقى على postgres.js).
 *
 * مبادئ الأمان (زي ما هي):
 *  - الصفوف بتعدي من نفس محرك التحقق تاني على السيرفر (validateRows) —
 *    الواجهة ملهاش أي سلطة على اللي هيتنفذ؛ الصف الغلط بيتشال هنا مهما حصل.
 *  - التنفيذ على دفعات — كل دفعة استعلام واحد atomic (كله أو لا شيء)؛ لو دفعة
 *    فشلت اللي قبلها محفوظ والباقي بيكمل، والرد بيقول بالظبط إيه اللي حصل.
 *  - حد الباقة (maxProducts) محسوب لحظة التنفيذ.
 *  - المنتجات الموجودة (بالباركود/الاسم): دمج كمية أو تخطي أو تحديث حسب اختيار المستخدم.
 *  - كل منتج جديد بكمية > 0 بيسجل حركة «رصيد افتتاحي (استيراد Excel)».
 *  - Idempotency-Key: نفس المفتاح مش هينفذ مرتين.
 */

interface CommitBody {
  headers?: unknown
  rows?: unknown
  mapping?: unknown
  mergeMode?: unknown
  excluded?: unknown
}

type RowResult = { idx: number; name: string; status: 'created' | 'merged' | 'skipped' | 'failed' | 'limit'; message?: string }

type DbHit = { id: number; name: string; branchId: number | null; price: number; cost: number; active: boolean }

const r3 = (n: number) => Math.round(n * 1000) / 1000

async function __POST(req: NextRequest) {
  const res = await withSql(async (sql) => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }
    try { requireModuleWritePermission(session, 'products') } catch (e) {
      const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
    }

    const body = (await req.json().catch(() => null)) as CommitBody | null
    if (!body || !Array.isArray(body.headers) || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'بيانات الاستيراد ناقصة — ابدأ من خطوة رفع الملف من الأول' }, { status: 400 })
    }
    const headers = body.headers.map((h: unknown) => String(h))
    const rawRows = body.rows.map((r: unknown) => (Array.isArray(r) ? r.map((c: unknown) => String(c ?? '')) : []))
    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json({ error: 'عدد الصفوف أكبر من الحد المسموح — قسّم الملف' }, { status: 400 })
    }
    const mapping = (body.mapping && typeof body.mapping === 'object' ? body.mapping : {}) as Partial<Record<ImportField, number>>
    const mergeMode = body.mergeMode === 'skip' || body.mergeMode === 'update' ? body.mergeMode : 'add'
    const excluded = Array.isArray(body.excluded) ? body.excluded.filter((n: unknown) => Number.isInteger(n)) : []

    // ── 1) نفس محرك التحقق (مصدر الحقيقة الوحيد) ──
    const { rows, mappingIssues } = validateRows(headers, rawRows, mapping, { mergeMode, excluded })
    if (mapping.name === undefined) {
      return NextResponse.json({ error: mappingIssues[0] || 'عمود اسم المنتج غير محدد' }, { status: 400 })
    }

    // ── 2) الموجود في القاعدة (نفس منطق التحليل بالظبط) ──
    const branchId = session.branchId ?? null
    const barcodes = [...new Set(rows.filter((r) => r.barcode && r.status !== 'error').map((r) => r.barcode as string))]
    const names = [...new Set(rows.filter((r) => r.name && r.status !== 'error').map((r) => r.name.trim().toLowerCase()))]
    const dbByBarcode = new Map<string, DbHit>()
    const dbByName = new Map<string, DbHit>()
    const branchCond = branchId == null ? sql`"branchId" IS NULL` : sql`"branchId" = ${branchId}`
    // الاستعلامين مستقلين — بنشغّلهم بالتوازي (العميل max:3)
    await Promise.all([
      barcodes.length
        ? sql<(DbHit & { barcode: string })[]>`
            SELECT "id", "name", "branchId", "price", "cost", "active", "barcode" FROM "Product"
            WHERE "tenantId" = ${session.tenantId} AND ${branchCond} AND "barcode" IN ${sql(barcodes)}`
            .then((rws) => { for (const r of rws) if (r.barcode) dbByBarcode.set(r.barcode, { id: Number(r.id), name: r.name, branchId: r.branchId, price: r.price, cost: r.cost, active: r.active }) })
        : null,
      names.length
        ? sql<DbHit[]>`
            SELECT "id", "name", "branchId", "price", "cost", "active" FROM "Product"
            WHERE "tenantId" = ${session.tenantId} AND lower(btrim("name")) IN ${sql(names)}`
            .then((rws) => {
              for (const r of rws) {
                const k = r.name.trim().toLowerCase()
                if (!dbByName.has(k)) dbByName.set(k, { id: Number(r.id), name: r.name, branchId: r.branchId, price: r.price, cost: r.cost, active: r.active })
              }
            })
        : null,
    ])

    // ── 3) سياق الباقة (مرة واحدة — كان بيتنادى ٣ مرات) + حد الباقة لحظة التنفيذ ──
    const ctx: PlanContext | null = await getPlanContext(session.tenantId).catch(() => null)
    const businessType = ctx?.businessType ?? null
    let remaining = Number.POSITIVE_INFINITY
    if (session.role !== 'SUPER_ADMIN' && ctx) {
      const limit = ctx.limits.maxProducts
      if (limit < UNLIMITED_PLAN_LIMIT) {
        try {
          const cnt = await sql<{ cnt: number }[]>`
            SELECT COUNT(*)::int AS cnt FROM "Product" WHERE "tenantId" = ${session.tenantId}`
          remaining = Math.max(0, limit - Number(cnt[0]?.cnt ?? 0))
        } catch { /* لو فشل القراءة نكمل — الحد بيتحقق تاني من الباقة عند الإنشاء العادي */ }
      }
    }

    // ── 4) بناء خطة التنفيذ ──
    const importable = importableRows(rows)
    // 🚀 فهرس الصفوف المكررة مرة واحدة — بدل rows.filter(...) لكل صف (كان O(n²): ٢٠٠٠×٢٠٠٠)
    const dupsByRoot = new Map<number, ParsedRow[]>()
    for (const r of rows) {
      if (r.mergedInto != null && r.status !== 'error') {
        const list = dupsByRoot.get(r.mergedInto)
        if (list) list.push(r); else dupsByRoot.set(r.mergedInto, [r])
      }
    }
    const qtyOf = (root: ParsedRow) => {
      let q = root.quantity
      for (const d of dupsByRoot.get(root.idx) ?? []) q += d.quantity // نفس mergedQtyFor بالظبط
      return r3(q)
    }

    type CreatePlan = { row: ParsedRow; qty: number; dups: ParsedRow[] }
    type MergePlan = { qty: number; setPrice: number | null; setCost: number | null; wasInactive: boolean; entries: RowResult[] }
    const creates: CreatePlan[] = []
    const merges = new Map<number, MergePlan>()
    const results: RowResult[] = []

    for (const row of importable) {
      const dupRows = dupsByRoot.get(row.idx) ?? []
      const qty = qtyOf(row)
      const existing =
        (row.barcode && dbByBarcode.get(row.barcode)) ||
        dbByName.get(row.name.trim().toLowerCase()) ||
        null

      if (existing) {
        if (mergeMode === 'skip') {
          results.push({ idx: row.idx, name: row.name, status: 'skipped', message: existing.active ? 'موجود بالفعل — تم التخطي حسب اختيارك' : 'المنتج موجود بس موقوف — اتخطى حسب اختيارك وما اتلمسش' })
          for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'skipped', message: 'صف مكرر — اتحسب جوه الصف الأصلي المتخطى' })
          continue
        }
        const m = merges.get(existing.id) ?? { qty: 0, setPrice: null, setCost: null, wasInactive: !existing.active, entries: [] }
        m.qty = r3(m.qty + qty)
        if (mergeMode === 'update') {
          if (row.price !== null) m.setPrice = row.price
          if (row.cost !== null) m.setCost = row.cost
        }
        // نفس كائنات النتيجة بتتحط في results وفي m.entries — لو الدفعة فشلت بنعدّل الحالة في مكان واحد
        const batch: RowResult[] = [
          { idx: row.idx, name: row.name, status: 'merged', message: `اتدمج مع «${existing.name}» (+${qty})${existing.active ? '' : ' — والمنتج كان موقوف فاترجّع يشتغل'}` },
          ...dupRows.map((d): RowResult => ({ idx: d.idx, name: d.name, status: 'merged', message: `صف مكرر — كمته اتضافت على «${existing.name}»` })),
        ]
        m.entries.push(...batch)
        results.push(...batch)
        merges.set(existing.id, m)
        continue
      }

      if (creates.length >= remaining) {
        results.push({ idx: row.idx, name: row.name, status: 'limit', message: 'تجاوزت حد الباقة — هذا الصف لم يُستورد' })
        for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'limit', message: 'صف مكرر فوق حد الباقة' })
        continue
      }
      creates.push({ row, qty, dups: dupRows })
    }

    // صفوف الأخطاء/الفاضية للشفافية
    for (const r of rows) {
      if (r.status === 'error') results.push({ idx: r.idx, name: r.name, status: 'failed', message: r.errors[0] || 'صف غير صالح' })
    }

    // ── 5) التنفيذ المجمّع ──
    const execCtx = { tenantId: session.tenantId, branchId, userId: session.userId ?? null }
    const withDefaultUnits = (ctx?.capabilities ?? []).includes('multi_unit') && businessType !== 'food'
    let created = 0
    let mergedCount = 0
    let totalQtyAdded = 0

    // 5-أ) الدمج في منتجات موجودة — استعلام واحد لكل دفعة (تحديث + حركة)
    // قيود «merged» اتحطت في الخطة قبل التنفيذ — لو الدفعة فشلت بنحوّلها لـ«failed».
    const mergeEntries = [...merges.entries()]
    for (let i = 0; i < mergeEntries.length; i += BULK_CHUNK) {
      const chunk = mergeEntries.slice(i, i + BULK_CHUNK)
      const payload: MergeRow[] = chunk.map(([id, m]) => ({ id, qty: m.qty, setPrice: m.setPrice, setCost: m.setCost, reactivate: m.wasInactive }))
      try {
        const r = await mergeQuantitiesBulk(sql, execCtx, payload)
        // لو منتج اتمسح بين الفحص والتنفيذ مش هيتحدّث — بنكشفه بدل ما نكذب
        if (r.merged !== chunk.length) throw new Error(`اتحدّث ${r.merged} من ${chunk.length} منتج — بعضها اتمسح أثناء الاستيراد`)
        mergedCount += r.merged
        totalQtyAdded += r.qty
      } catch (e: any) {
        for (const [, m] of chunk) {
          for (const entry of m.entries) {
            entry.status = 'failed'
            entry.message = `فشل دمج الكمية: ${e?.message ?? 'خطأ غير معروف'}`
          }
        }
      }
    }

    // 5-ب) إنشاء المنتجات الجديدة — استعلام واحد لكل دفعة (منتجات + تصنيفات + وحدات + حركات)
    for (let i = 0; i < creates.length; i += BULK_CHUNK) {
      const chunk = creates.slice(i, i + BULK_CHUNK)
      const payload: NewProductRow[] = chunk.map(({ row, qty }) => {
        const q = r3(qty)
        return {
          name: row.name,
          category: row.category && row.category.trim() ? row.category.trim() : null,
          barcode: row.barcode,
          price: row.price ?? 0,
          cost: row.cost ?? 0,
          qty: q,
          minQuantity: row.minQuantity !== null ? Math.round(row.minQuantity * 100) / 100 || 1 : 1,
          // 👕 الموسم والمعروض — فاشون بس، والمعروض محصور بين 0 والكمية
          season: businessType === 'fashion' && row.season ? row.season : 'ALL_YEAR',
          displayQty:
            businessType === 'fashion' && row.displayQty !== null
              ? Math.max(0, Math.min(row.displayQty, q))
              : q,
          unitLabel:
            businessType === 'food'
              ? row.unit ? cleanUnitLabel(row.unit) : guessUnitLabel(row.name)
              : null,
        }
      })
      try {
        const n = await insertProductsBulk(sql, { ...execCtx, withDefaultUnits }, payload)
        if (n !== chunk.length) throw new Error(`اتعمل ${n} من ${chunk.length}`)
        for (const { row, qty, dups } of chunk) {
          results.push({ idx: row.idx, name: row.name, status: 'created', message: qty > 0 ? `اتعمل بمخزون افتتاحي ${qty}` : 'اتعمل بدون مخزون' })
          for (const d of dups) results.push({ idx: d.idx, name: d.name, status: 'created', message: 'صف مكرر — كمته اتضافت مع أول صف للمنتج' })
        }
        created += chunk.length
        totalQtyAdded += chunk.reduce((s, c) => s + c.qty, 0)
      } catch (e: any) {
        // الدفعة atomic — فشلها = مفيش ولا منتج منها اتعمل (ولا حركة ولا وحدة يتيمة)
        const why = e?.code === '23505' ? 'باركود أو اسم مكرر مع منتج اتضاف في نفس اللحظة' : (e?.message ?? 'خطأ غير معروف')
        for (const { row, dups } of chunk) {
          results.push({ idx: row.idx, name: row.name, status: 'failed', message: `فشل إنشاء المنتج: ${why}` })
          for (const d of dups) results.push({ idx: d.idx, name: d.name, status: 'failed', message: `فشل إنشاء المنتج: ${why}` })
        }
      }
    }

    // صفوف مش ضمن أي نتيجة (نظريًا مستحيل) — للسلامة
    const covered = new Set(results.map((r) => r.idx))
    for (const r of importable) {
      if (!covered.has(r.idx)) results.push({ idx: r.idx, name: r.name, status: 'failed', message: 'لم تُنفّذ — راجع الشيت' })
    }

    // ── 6) تنظيف الكاش + التدقيق ──
    if (created > 0 || mergedCount > 0) {
      await purgeCatalogCaches(session.tenantId, session.branchId).catch(() => {})
    }
    const skippedExisting = results.filter((r) => r.status === 'skipped').length
    const limitHit = results.filter((r) => r.status === 'limit').length
    const totalFailed = results.filter((r) => r.status === 'failed').length
    // كان fire-and-forget (.catch فقط) — على Workers أي promise بعد إرسال الرد ممكن يتقطع
    // فالتدقيق كان ممكن يضيع. دلوقتي استعلام INSERT واحد صغير ومستني.
    await logAudit(
      {
        action: 'products.import',
        targetType: 'Product',
        details: {
          created,
          merged: mergedCount,
          skippedExisting,
          limitHit,
          failed: totalFailed,
          totalQtyAdded: r3(totalQtyAdded),
          rowsInFile: rawRows.length,
          mergeMode,
          sheet: headers.slice(0, 12),
        },
      },
      req,
    ).catch(() => {})

    return NextResponse.json({
      created,
      merged: mergedCount,
      skippedExisting,
      limitHit,
      failed: totalFailed,
      totalQtyAdded: r3(totalQtyAdded),
      results,
      mappingIssues,
      blankRows: rows.filter((r) => r.status === 'blank').length,
    })
  })
  // 🛡️ نفس الـ security headers اللي كان withDb بيضيفها (من غير ما نحمّل Prisma)
  return applySecurityHeaders(res)
}

export async function POST(req: NextRequest) {
  return withIdempotency(req, () => __POST(req))
}
