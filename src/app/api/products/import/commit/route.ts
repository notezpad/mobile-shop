import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModuleWritePermission, featureErrorResponse, getPlanContext, UNLIMITED_PLAN_LIMIT } from '@/lib/features'
import { getSql } from '@/lib/sql'
import { withIdempotency } from '@/lib/idempotency'
import { logAudit } from '@/lib/audit'
import { cleanUnitLabel, guessUnitLabel } from '@/lib/unit-label'
import { purgeCatalogCaches } from '@/lib/edgeCache'
import { validateRows, importableRows, mergedQtyFor, MAX_ROWS, type ImportField, type ParsedRow } from '@/lib/smart-import'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-10-22 — تنفيذ الاستيراد الذكي (الخطوة الأخيرة)
 *
 * مبادئ الأمان:
 *  - الصفوف بتعدي من نفس محرك التحقق تاني على السيرفر (validateRows) —
 *    الواجهة ملهاش أي سلطة على اللي هيتنفذ؛ الصف الغلط بيتشال هنا مهما حصل.
 *  - التنفيذ على دفعات (chunks) كل واحدة في transaction مستقلة — لو دفعة
 *    فشلت، اللي قبلها محفوظ والباقي بيكمل، والرد بيقول بالظبط إيه اللي حصل.
 *  - حد الباقة (maxProducts) محسوب لحظة التنفيذ — اللي فوق الحد بيتخطى
 *    برسالة واضحة مش خطأ غامض.
 *  - المنتجات الموجودة (بالباركود/الاسم): دمج كمية أو تخطي أو تحديث حسب
 *    اختيار المستخدم — مفيش تكرار منتجات ولا ضغط كميات من غير علم.
 *  - كل منتج جديد بكمية > 0 بيسجل حركة «رصيد افتتاحي (استيراد Excel)» —
 *    نفس سلوك إضافة منتج عادي بالكمية (الطريقة الصحيحة للبضاعة القديمة،
 *    مش أوامر شراء وهمية).
 *  - Idempotency-Key: لو الرد ضاع بعد التنفيذ وإعادة المحاولة حصلت،
 *    نفس المفتاح مش هينفذ مرتين (فشل شبكة ≠ استيراد مزدوج).
 */

interface CommitBody {
  headers?: unknown
  rows?: unknown
  mapping?: unknown
  mergeMode?: unknown
  excluded?: unknown
}

type RowResult = { idx: number; name: string; status: 'created' | 'merged' | 'skipped' | 'failed' | 'limit'; message?: string }

async function __POST(req: NextRequest) {
  return withDb(async () => {
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
    let rawRows = body.rows.map((r: unknown) => (Array.isArray(r) ? r.map((c: unknown) => String(c ?? '')) : []))
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
    const sql = await getSql()
    const barcodes = [...new Set(rows.filter((r) => r.barcode && r.status !== 'error').map((r) => r.barcode as string))]
    const names = [...new Set(rows.filter((r) => r.name && r.status !== 'error').map((r) => r.name.trim().toLowerCase()))]
    const dbByBarcode = new Map<string, { id: number; name: string; branchId: number | null; price: number; cost: number }>()
    const dbByName = new Map<string, { id: number; name: string; branchId: number | null; price: number; cost: number }>()
    const branchCond = branchId == null ? sql`"branchId" IS NULL` : sql`"branchId" = ${branchId}`
    if (barcodes.length) {
      const rws = await sql<{ id: number; name: string; branchId: number | null; price: number; cost: number; barcode: string }[]>`
        SELECT "id", "name", "branchId", "price", "cost", "barcode" FROM "Product"
        WHERE "tenantId" = ${session.tenantId} AND ${branchCond} AND "barcode" IN ${sql(barcodes)}`
      for (const r of rws) if (r.barcode) dbByBarcode.set(r.barcode, { id: Number(r.id), name: r.name, branchId: r.branchId, price: r.price, cost: r.cost })
    }
    if (names.length) {
      const rws = await sql<{ id: number; name: string; branchId: number | null; price: number; cost: number }[]>`
        SELECT "id", "name", "branchId", "price", "cost" FROM "Product"
        WHERE "tenantId" = ${session.tenantId} AND lower(btrim("name")) IN ${sql(names)}`
      for (const r of rws) {
        const k = r.name.trim().toLowerCase()
        if (!dbByName.has(k)) dbByName.set(k, { id: Number(r.id), name: r.name, branchId: r.branchId, price: r.price, cost: r.cost })
      }
    }

    // ── 3) حد الباقة لحظة التنفيذ ──
    let remaining = Number.POSITIVE_INFINITY
    if (session.role !== 'SUPER_ADMIN') {
      try {
        const ctx = await getPlanContext(session.tenantId)
        const limit = ctx.limits.maxProducts
        if (limit < UNLIMITED_PLAN_LIMIT) {
          const cnt = await sql<{ cnt: number }[]>`
            SELECT COUNT(*)::int AS cnt FROM "Product" WHERE "tenantId" = ${session.tenantId}`
          remaining = Math.max(0, limit - Number(cnt[0]?.cnt ?? 0))
        }
      } catch { /* لو فشل القراءة نكمل — createMany هيُفشل بالحد لو اتحقق */ }
    }

    // ── 4) بناء خطة التنفيذ ──
    const importable = importableRows(rows)
    const creates: { row: ParsedRow; qty: number }[] = []
    const merges = new Map<number, { name: string; qty: number; setPrice: number | null; setCost: number | null; branchId: number | null; idx: number }>()
    const results: RowResult[] = []

    for (const row of importable) {
      const dupRows = rows.filter((r) => r.mergedInto === row.idx && r.status !== 'error')
      const qty = mergedQtyFor(rows, row)
      const existing =
        (row.barcode && dbByBarcode.get(row.barcode)) ||
        dbByName.get(row.name.trim().toLowerCase()) ||
        null

      if (existing) {
        if (mergeMode === 'skip') {
          results.push({ idx: row.idx, name: row.name, status: 'skipped', message: 'موجود بالفعل — تم التخطي حسب اختيارك' })
          for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'skipped', message: 'صف مكرر — اتحسب جوه الصف الأصلي المتخطى' })
          continue
        }
        const m = merges.get(existing.id) ?? { name: existing.name, qty: 0, setPrice: null, setCost: null, branchId: existing.branchId, idx: row.idx }
        m.qty = Math.round((m.qty + qty) * 1000) / 1000
        if (mergeMode === 'update') {
          if (row.price !== null) m.setPrice = row.price
          if (row.cost !== null) m.setCost = row.cost
        }
        merges.set(existing.id, m)
        results.push({ idx: row.idx, name: row.name, status: 'merged', message: `اتدمج مع «${existing.name}» (+${qty})` })
        for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'merged', message: `صف مكرر — كمته اتضافت على «${existing.name}»` })
        continue
      }

      if (creates.length >= remaining) {
        results.push({ idx: row.idx, name: row.name, status: 'limit', message: 'تجاوزت حد الباقة — هذا الصف لم يُستورد' })
        for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'limit', message: 'صف مكرر فوق حد الباقة' })
        continue
      }
      creates.push({ row, qty })
      for (const d of dupRows) results.push({ idx: d.idx, name: d.name, status: 'created', message: 'صف مكرر — كمته اتضافت مع أول صف للمنتج' })
    }

    // صفوف الأخطاء/الفاضية للشفافية
    for (const r of rows) {
      if (r.status === 'error') results.push({ idx: r.idx, name: r.name, status: 'failed', message: r.errors[0] || 'صف غير صالح' })
    }

    // ── 5) التنفيذ على دفعات ──
    const CHUNK = 150
    const businessType = (await getPlanContext(session.tenantId).catch(() => null))?.businessType ?? null
    const planCtxCapabilities: string[] = []
    try { planCtxCapabilities.push(...((await getPlanContext(session.tenantId))?.capabilities ?? [])) } catch {}

    let created = 0
    let mergedCount = 0
    let totalQtyAdded = 0

    // 5-أ) الدمج في منتجات موجودة — تحديث واحد لكل منتج + حركة واحدة
    // ملاحظة: قيود «merged» اتحطت في الخطة قبل التنفيذ — لو الدفعة فشلت
    // بتحول قيود صفوفها من «merged» لـ«failed» بدل ما تفضل كذب.
    const mergeEntries = [...merges.entries()]
    for (let i = 0; i < mergeEntries.length; i += CHUNK) {
      const chunk = mergeEntries.slice(i, i + CHUNK)
      try {
        await db.$transaction(
          async (tx) => {
            for (const [id, m] of chunk) {
              await tx.product.update({
                where: { id },
                data: {
                  quantity: { increment: m.qty },
                  ...(m.setPrice !== null ? { price: m.setPrice } : {}),
                  ...(m.setCost !== null ? { cost: m.setCost } : {}),
                },
              })
              if (m.qty > 0) {
                await tx.stockMovement.create({
                  data: {
                    tenantId: session.tenantId,
                    branchId: m.branchId,
                    productId: id,
                    type: 'in',
                    quantity: m.qty,
                    refType: 'manual',
                    note: 'رصيد افتتاحي (استيراد Excel — دمج كمية)',
                    userId: session.userId,
                  },
                })
              }
            }
          },
          { timeout: 60_000, maxWait: 15_000 },
        )
        for (const [, m] of chunk) {
          mergedCount++
          totalQtyAdded += m.qty
        }
      } catch (e: any) {
        for (const [, m] of chunk) {
          const entry = results.find((r) => r.idx === m.idx && r.status === 'merged')
          if (entry) {
            entry.status = 'failed'
            entry.message = `فشل دمج الكمية: ${e?.message ?? 'خطأ غير معروف'}`
          }
        }
      }
    }

    // 5-ب) إنشاء المنتجات الجديدة
    for (let i = 0; i < creates.length; i += CHUNK) {
      const chunk = creates.slice(i, i + CHUNK)
      // نجاحات الدفعة بتتجمع هنا جوه المعاملة — وبتتسجل في النتيجة **بعد** نجاحها
      // (لو المعاملة اترجعت بالكامل مفيش أي قيد نتيجة كاذبة)
      const done: { idx: number; name: string; qty: number }[] = []
      try {
        await db.$transaction(
          async (tx) => {
            for (const { row, qty } of chunk) {
              // التصنيف: إيجاد أو إنشاء داخل نفس المعاملة
              let category: string | null = null
              if (row.category && row.category.trim()) {
                const cname = row.category.trim()
                const found = await tx.category.findFirst({ where: { tenantId: session.tenantId, name: cname }, select: { id: true } })
                if (!found) await tx.category.create({ data: { tenantId: session.tenantId, name: cname } })
                category = cname
              }
              const createdProduct = await tx.product.create({
                data: {
                  tenantId: session.tenantId,
                  name: row.name,
                  category,
                  barcode: row.barcode,
                  price: row.price ?? 0,
                  cost: row.cost ?? 0,
                  quantity: Math.round(qty * 1000) / 1000,
                  minQuantity: row.minQuantity !== null ? Math.round(row.minQuantity * 100) / 100 || 1 : 1,
                  soldByWeight: false,
                  unitLabel:
                    businessType === 'food'
                      ? row.unit
                        ? cleanUnitLabel(row.unit)
                        : guessUnitLabel(row.name)
                      : null,
                  branchId,
                },
              })
              // باقة multi_unit — نفس سلوك إضافة منتج عادي
              if (planCtxCapabilities.includes('multi_unit') && businessType !== 'food') {
                try {
                  const { buildDefaultUnitsData } = await import('@/lib/default-units')
                  await tx.productUnit.createMany({ data: buildDefaultUnitsData(createdProduct.id, row.price ?? 0) })
                } catch { /* الوحدات اختيارية — لا توقف الاستيراد */ }
              }
              if (qty > 0) {
                await tx.stockMovement.create({
                  data: {
                    tenantId: session.tenantId,
                    branchId,
                    productId: createdProduct.id,
                    type: 'in',
                    quantity: Math.round(qty * 1000) / 1000,
                    refType: 'manual',
                    note: 'رصيد افتتاحي (استيراد Excel)',
                    userId: session.userId,
                  },
                })
              }
              done.push({ idx: row.idx, name: row.name, qty })
            }
          },
          { timeout: 60_000, maxWait: 15_000 },
        )
        results.push(
          ...done.map((d): RowResult => ({
            idx: d.idx,
            name: d.name,
            status: 'created',
            message: d.qty > 0 ? `اتعمل بمخزون افتتاحي ${d.qty}` : 'اتعمل بدون مخزون',
          })),
        )
        created += done.length
        totalQtyAdded += done.reduce((s, d) => s + d.qty, 0)
      } catch (e: any) {
        for (const { row } of chunk) results.push({ idx: row.idx, name: row.name, status: 'failed', message: `فشل إنشاء المنتج: ${e?.message ?? 'خطأ غير معروف'}` })
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
    logAudit(
      {
        action: 'products.import',
        targetType: 'Product',
        details: {
          created,
          merged: mergedCount,
          skippedExisting,
          limitHit,
          failed: totalFailed,
          totalQtyAdded: Math.round(totalQtyAdded * 1000) / 1000,
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
      totalQtyAdded: Math.round(totalQtyAdded * 1000) / 1000,
      results,
      mappingIssues,
      blankRows: rows.filter((r) => r.status === 'blank').length,
    })
  })
}

export async function POST(req: NextRequest) {
  return withIdempotency(req, () => __POST(req))
}
