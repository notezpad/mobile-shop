import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModuleWritePermission, featureErrorResponse, getPlanContext, UNLIMITED_PLAN_LIMIT } from '@/lib/features'
import { getSql } from '@/lib/sql'
import {
  parseWorkbook,
  detectMapping,
  validateRows,
  MAX_FILE_BYTES,
  MAX_ROWS,
  type ParsedWorkbook,
  type ImportField,
} from '@/lib/smart-import'

export const dynamic = 'force-dynamic'

/**
 * 🧠 2026-10-22 — تحليل ملف الاستيراد (الخطوة الذكية)
 *
 * وضعان في نفس المسار:
 *  1) multipart/form-data مع «file» (+ اختياري «sheet»): نقرأ الملف، نفهم
 *     طبيعته (صف العناوين/الشيت الأنسب)، نطابق الأعمدة تلقائيًا، ونتحقق من
 *     كل صف + ندوّر على التكرارات في القاعدة (بالباركود/الاسم).
 *  2) application/json {headers, rows, mapping, mergeMode}: المستخدم غيّر
 *     مطابقة عمود في الواجهة → نعيد التحقق فقط من نفس الصفوف الخام
 *     (مفيش إعادة رفع للملف — سريع وسلس).
 *
 * الرد بيحتوي كل حاجة الويزارد يحتاجها: الشيتات، العناوين، الصفوف الخام،
 * المطابقة + الثقة، التحقق لكل صف، الإحصائيات، ومتبقي حد الباقة.
 */

async function findDbDuplicates(
  tenantId: string,
  branchId: number | null,
  items: { name: string; barcode: string | null }[],
): Promise<Map<string, { id: number; name: string; byBarcode: boolean; active: boolean }>> {
  const res = new Map<string, { id: number; name: string; byBarcode: boolean; active: boolean }>()
  const barcodes = [...new Set(items.map((i) => i.barcode).filter((b): b is string => !!b))]
  const names = [...new Set(items.map((i) => i.name.trim().toLowerCase()).filter(Boolean))]
  if (!barcodes.length && !names.length) return res

  const sql = await getSql()
  const branchCond = branchId == null ? sql`"branchId" IS NULL` : sql`"branchId" = ${branchId}`

  if (barcodes.length) {
    const rows = await sql<{ id: number; name: string; barcode: string; active: boolean }[]>`
      SELECT "id", "name", "barcode", "active" FROM "Product"
      WHERE "tenantId" = ${tenantId} AND ${branchCond} AND "barcode" IN ${sql(barcodes)}`
    for (const r of rows) {
      if (r.barcode) res.set(r.barcode, { id: Number(r.id), name: r.name, byBarcode: true, active: r.active })
    }
  }
  if (names.length) {
    // بالاسم: مطابقة تامة بعد lowercase/trim — الباركود هو المطابقة القوية
    const rows = await sql<{ id: number; name: string; active: boolean }[]>`
      SELECT "id", "name", "active" FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND lower(btrim("name")) IN ${sql(names)}`
    for (const r of rows) {
      const key = r.name.trim().toLowerCase()
      if (!res.has(key)) res.set(key, { id: Number(r.id), name: r.name, byBarcode: false, active: r.active })
    }
  }
  return res
}

export async function POST(req: NextRequest) {
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

    const ct = req.headers.get('content-type') || ''

    let headers: string[]
    let rawRows: string[][]
    let mapping: Partial<Record<ImportField, number>>
    let sheetInfo: Pick<ParsedWorkbook, 'sheetName' | 'sheetsInfo' | 'truncated' | 'junkRows' | 'headerless'> | null = null
    let mergeMode: 'add' | 'skip' | 'update' = 'add'
    let excluded: number[] = []

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null)
      const file = form?.get('file')
      if (!form || !file || typeof file === 'string') {
        return NextResponse.json({ error: 'ارفع ملف الإكسيل الأول' }, { status: 400 })
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'الملف أكبر من الحد المسموح (5 ميجا) — قسّمه على ملفين' }, { status: 400 })
      }
      const buf = await file.arrayBuffer()
      const preferredSheet = (form.get('sheet') as string) || undefined
      let parsed: ParsedWorkbook
      try {
        parsed = await parseWorkbook(buf, file.name, preferredSheet)
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message || 'مش قادرين نقرأ الملف — تأكد إنه ملف إكسيل حقيقي (xlsx/xls/csv)' },
          { status: 400 },
        )
      }
      // mapping يدوي اختياري مع الملف (لما المستخدم يبدّل شيت ويحافظ على مطابقته)
      const manualMapping = form.get('mapping')
      if (typeof manualMapping === 'string' && manualMapping.trim()) {
        try { mapping = JSON.parse(manualMapping) } catch { mapping = detectMapping(parsed.headers, parsed.headerless).mapping }
      } else {
        mapping = detectMapping(parsed.headers, parsed.headerless).mapping
      }
      headers = parsed.headers
      rawRows = parsed.rows
      sheetInfo = {
        sheetName: parsed.sheetName,
        sheetsInfo: parsed.sheetsInfo,
        truncated: parsed.truncated,
        junkRows: parsed.junkRows,
        headerless: parsed.headerless,
      }
    } else {
      // 🛡️ حارس حجم — وضع JSON مخصص لإعادة التحقق فقط (نفس الصفوف الراجعة)
      const cl = parseInt(req.headers.get('content-length') || '0', 10)
      if (cl > 30 * 1024 * 1024) {
        return NextResponse.json({ error: 'حجم البيانات كبير جدًا' }, { status: 413 })
      }
      const body = await req.json().catch(() => null)
      if (!body || !Array.isArray(body.headers) || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: 'بيانات التحليل ناقصة — ارفع الملف تاني' }, { status: 400 })
      }
      headers = body.headers.map((h: unknown) => String(h))
      rawRows = body.rows.map((r: unknown) => (Array.isArray(r) ? r.map((c: unknown) => String(c ?? '')) : []))
      mapping = body.mapping && typeof body.mapping === 'object' ? body.mapping : {}
      mergeMode = body.mergeMode === 'skip' || body.mergeMode === 'update' ? body.mergeMode : 'add'
      excluded = Array.isArray(body.excluded) ? body.excluded.filter((n: unknown) => Number.isInteger(n)) : []
      if (rawRows.length > MAX_ROWS) rawRows = rawRows.slice(0, MAX_ROWS)
    }

    // 🔍 التحقق + الإصلاح التلقائي
    const { rows, stats, mappingIssues } = validateRows(headers, rawRows, mapping, { mergeMode, excluded })

    // 🔎 فحص الموجود في القاعدة (بالباركود أولاً ثم الاسم)
    const found = await findDbDuplicates(
      session.tenantId,
      session.branchId ?? null,
      rows.filter((r) => r.name && r.status !== 'error' && r.status !== 'blank'),
    )
    let existsCount = 0
    for (const r of rows) {
      if (r.status === 'error' || r.status === 'blank' || !r.name) continue
      const hit = (r.barcode && found.get(r.barcode)) || found.get(r.name.trim().toLowerCase())
      if (hit) {
        r.existsInDb = hit
        existsCount++
        const how = hit.byBarcode ? 'بنفس الباركود' : 'بنفس الاسم'
        if (mergeMode === 'skip') {
          r.warnings.push(
            hit.active
              ? `المنتج موجود بالفعل (${how}: «${hit.name}») — هيتخطى حسب اختيارك`
              : `المنتج موجود بس موقوف (${how}: «${hit.name}») — هيتخطى حسب اختيارك وهيفضل موقوف`,
          )
          if (r.status === 'ok' || r.status === 'fixed') r.status = 'warn'
        } else {
          const extra = mergeMode === 'update' ? ' + هيتحدّث سعره وتكلفته من الشيت' : ''
          r.warnings.push(
            hit.active
              ? `المنتج موجود بالفعل (${how}: «${hit.name}») — كميته هتتضاف على الموجود${extra}`
              : `المنتج موجود بس موقوف (${how}: «${hit.name}») — عند التنفيذ هيترجع يشتغل تلقائيًا وكمية الشيت هتتضاف على الموجود${extra}`,
          )
          if (r.status === 'ok' || r.status === 'fixed') r.status = 'warn'
        }
      }
    }
    stats.existsInDb = existsCount
    if (sheetInfo) {
      stats.truncated = sheetInfo.truncated
      stats.junkRows = sheetInfo.junkRows
      stats.headerless = sheetInfo.headerless
    }

    // 📋 معلومات الباقة — الواجهة بتعرض متبقي الحد قبل التنفيذ
    let plan: { remaining: number | null; limit: number | null } = { remaining: null, limit: null }
    try {
      if (session.role !== 'SUPER_ADMIN') {
        const ctx = await getPlanContext(session.tenantId)
        const limit = ctx.limits.maxProducts
        if (limit < UNLIMITED_PLAN_LIMIT) {
          const sql = await getSql()
          const cnt = await sql<{ cnt: number }[]>`
            SELECT COUNT(*)::int AS cnt FROM "Product" WHERE "tenantId" = ${session.tenantId}`
          const current = Number(cnt[0]?.cnt ?? 0)
          plan = { limit, remaining: Math.max(0, limit - current) }
        }
      }
    } catch { /* معلومة إضافية — فشلها لا يوقف التحليل */ }

    const { confidence, autoDetected } = detectMapping(headers, sheetInfo?.headerless ?? false)

    return NextResponse.json({
      ...(sheetInfo ? { sheetName: sheetInfo.sheetName, sheetsInfo: sheetInfo.sheetsInfo } : {}),
      headers,
      rows: rawRows,
      mapping,
      confidence,
      autoDetected,
      validation: { rows, stats, mappingIssues },
      plan,
    })
  })
}
