import { BRAND } from '@/lib/print'
import type * as XLSXNamespace from 'xlsx-js-style'

/**
 * Shared Excel export engine.
 *
 * Goal: every "تصدير Excel" button in the app produces a real, styled
 * .xlsx workbook (not a renamed CSV) that visually matches the brand
 * system already used by the PDF/print templates (`src/lib/print.ts`):
 * same green identity, same shop header block, same clean table look —
 * just inside a spreadsheet instead of a printed page.
 *
 * ⚡ PERF FIX (2026-10-05 — slow mobile navigation):
 * xlsx-js-style weighs ~870KB minified. It USED to be statically imported
 * here, so EVERY view that imports this module (Products, Customers,
 * Suppliers, Sales, Purchases, Expenses, Inventory tabs…) pulled the whole
 * 870KB chunk into its own route chunk. On a phone with a weak connection
 * that meant downloading + parsing ~870KB just to OPEN the page — before
 * any data fetch could even start. Now the library is loaded lazily the
 * first time an actual export runs, so navigating to any page downloads
 * only that page's real code and the 870KB is paid ONLY when the user
 * actually clicks "تصدير Excel" (once — then it's cached).
 */

let xlsxPromise: Promise<typeof XLSXNamespace> | null = null
function loadXLSX(): Promise<typeof XLSXNamespace> {
  if (!xlsxPromise) xlsxPromise = import('xlsx-js-style')
  return xlsxPromise
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExcelColFormat = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'int'

export interface ExcelColumn {
  /** Column header label (Arabic) */
  header: string
  /** Key to read from each row object */
  key: string
  /** Value formatting */
  format?: ExcelColFormat
  /** Manual width override (characters). Auto-computed otherwise. */
  width?: number
  /** Force text alignment; defaults based on format */
  align?: 'right' | 'left' | 'center'
}

export interface ExcelSheet {
  /** Sheet tab name (max 31 chars, no special chars — sanitized automatically) */
  name: string
  /** Optional section title printed above the table (e.g. "أفضل المنتجات") */
  title?: string
  columns: ExcelColumn[]
  rows: Record<string, any>[]
  /** Optional bold totals/summary row appended under the table */
  totals?: Record<string, any>
  /** Optional KPI/summary blocks rendered as label/value pairs above the table
   *  (used for the main report sheet, mimicking the PDF summary cards) */
  kpis?: { label: string; value: string | number; format?: ExcelColFormat }[]
}

export interface ExcelWorkbookOptions {
  fileName: string
  shop: { name?: string; phone?: string; address?: string }
  /** Document title, e.g. "تقرير الأداء الشامل" / "قائمة المنتجات" */
  documentTitle: string
  /** Free-text period / filter description, e.g. "من 2026/06/01 إلى 2026/06/30" */
  periodLabel?: string
  sheets: ExcelSheet[]
}

// ---------------------------------------------------------------------------
// Style tokens (mirrors BRAND from print.ts)
// ---------------------------------------------------------------------------

const HEX = (c: string) => c.replace('#', '').toUpperCase()

const S = {
  brandBar: HEX(BRAND.primary),
  headerBg: HEX(BRAND.primaryDark),
  headerFg: 'FFFFFF',
  titleFg: HEX(BRAND.primaryDark),
  subFg: HEX(BRAND.sub),
  ink: HEX(BRAND.ink),
  border: HEX(BRAND.border),
  bandBg: 'F5FAF6',
  totalsBg: HEX(BRAND.primaryLight),
  white: 'FFFFFF',
}

const thinBorder = { style: 'thin', color: { rgb: S.border } } as const
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

const numFmt: Record<ExcelColFormat, string | undefined> = {
  text: undefined,
  number: '#,##0.00',
  int: '#,##0',
  currency: '#,##0.00 "ج.م"',
  percent: '0.0%',
  date: 'yyyy/mm/dd',
}

function alignFor(col: ExcelColumn): 'right' | 'left' | 'center' {
  if (col.align) return col.align
  if (col.format === 'text' || col.format === undefined) return 'right'
  return 'center'
}

// ---------------------------------------------------------------------------
// Sheet builder
// ---------------------------------------------------------------------------

function sanitizeSheetName(name: string, used: Set<string>): string {
  let clean = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'ورقة'
  let final = clean
  let i = 2
  while (used.has(final)) {
    final = `${clean.slice(0, 28)} ${i}`
    i++
  }
  used.add(final)
  return final
}

function buildSheet(XLSX: typeof XLSXNamespace, sheet: ExcelSheet, shop: ExcelWorkbookOptions['shop'], documentTitle: string, periodLabel?: string): XLSXNamespace.WorkSheet {
  const cols = sheet.columns
  const colCount = Math.max(cols.length, 1)
  const aoa: any[][] = []
  const merges: XLSXNamespace.Range[] = []
  const rowStyles: Record<number, Record<number, any>> = {}
  let r = 0

  const setStyle = (row: number, col: number, style: any) => {
    if (!rowStyles[row]) rowStyles[row] = {}
    rowStyles[row][col] = style
  }
  const fillRow = (row: number, style: any, from = 0, to = colCount - 1) => {
    for (let c = from; c <= to; c++) setStyle(row, c, style)
  }

  // --- Brand bar --------------------------------------------------------
  aoa.push(new Array(colCount).fill(''))
  fillRow(r, { fill: { fgColor: { rgb: S.brandBar } } })
  merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
  r++

  // --- Shop header --------------------------------------------------------
  aoa.push([shop.name || 'المحل', ...new Array(Math.max(colCount - 1, 0)).fill('')])
  setStyle(r, 0, {
    font: { bold: true, sz: 16, color: { rgb: S.titleFg } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })
  merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
  r++

  const metaParts = [shop.phone, shop.address].filter(Boolean).join('   •   ')
  if (metaParts) {
    aoa.push([metaParts, ...new Array(Math.max(colCount - 1, 0)).fill('')])
    setStyle(r, 0, { font: { sz: 10, color: { rgb: S.subFg } }, alignment: { horizontal: 'center' } })
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
    r++
  }

  aoa.push([documentTitle, ...new Array(Math.max(colCount - 1, 0)).fill('')])
  setStyle(r, 0, {
    font: { bold: true, sz: 12, color: { rgb: S.headerBg } },
    alignment: { horizontal: 'center' },
    fill: { fgColor: { rgb: S.totalsBg } },
  })
  fillRow(r, { fill: { fgColor: { rgb: S.totalsBg } }, font: { bold: true, sz: 12, color: { rgb: S.headerBg } }, alignment: { horizontal: 'center' } })
  merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
  r++

  if (periodLabel) {
    aoa.push([periodLabel, ...new Array(Math.max(colCount - 1, 0)).fill('')])
    setStyle(r, 0, { font: { sz: 10, italic: true, color: { rgb: S.subFg } }, alignment: { horizontal: 'center' } })
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
    r++
  }

  aoa.push(new Array(colCount).fill('')) // spacer
  r++

  // --- Optional section title -------------------------------------------
  if (sheet.title) {
    aoa.push([sheet.title, ...new Array(Math.max(colCount - 1, 0)).fill('')])
    setStyle(r, 0, { font: { bold: true, sz: 12, color: { rgb: S.headerBg } }, alignment: { horizontal: 'right' } })
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } })
    r++
  }

  // --- Optional KPI block (label/value pairs, 2 per row) ------------------
  if (sheet.kpis?.length) {
    for (let i = 0; i < sheet.kpis.length; i += 2) {
      const pair = sheet.kpis.slice(i, i + 2)
      const row: any[] = []
      pair.forEach((kpi) => {
        row.push(kpi.label, kpi.value)
      })
      while (row.length < colCount) row.push('')
      aoa.push(row)
      pair.forEach((kpi, idx) => {
        const labelCol = idx * 2
        const valueCol = idx * 2 + 1
        setStyle(r, labelCol, {
          font: { bold: true, sz: 10, color: { rgb: S.subFg } },
          alignment: { horizontal: 'right' },
        })
        setStyle(r, valueCol, {
          font: { bold: true, sz: 11, color: { rgb: S.ink } },
          alignment: { horizontal: 'center' },
          fill: { fgColor: { rgb: S.bandBg } },
          numFmt: kpi.format ? numFmt[kpi.format] : undefined,
        })
      })
      r++
    }
    aoa.push(new Array(colCount).fill('')) // spacer
    r++
  }

  // --- Table header ---------------------------------------------------
  const headerRowIdx = r
  aoa.push(cols.map((c) => c.header))
  cols.forEach((_, c) =>
    setStyle(headerRowIdx, c, {
      font: { bold: true, sz: 10.5, color: { rgb: S.headerFg } },
      fill: { fgColor: { rgb: S.headerBg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: allBorders,
    })
  )
  r++

  // --- Data rows ---------------------------------------------------------
  const dataStartRow = r
  sheet.rows.forEach((rowObj, i) => {
    const rowArr = cols.map((c) => rowObj[c.key] ?? '')
    aoa.push(rowArr)
    const banded = i % 2 === 1
    cols.forEach((c, ci) => {
      setStyle(r, ci, {
        font: { sz: 10, color: { rgb: S.ink } },
        alignment: { horizontal: alignFor(c), vertical: 'center' },
        fill: banded ? { fgColor: { rgb: S.bandBg } } : undefined,
        border: allBorders,
        numFmt: c.format ? numFmt[c.format] : undefined,
      })
    })
    r++
  })

  // --- Totals row ----------------------------------------------------
  if (sheet.totals) {
    const rowArr = cols.map((c) => sheet.totals![c.key] ?? '')
    aoa.push(rowArr)
    cols.forEach((c, ci) => {
      setStyle(r, ci, {
        font: { bold: true, sz: 10.5, color: { rgb: S.headerBg } },
        alignment: { horizontal: alignFor(c), vertical: 'center' },
        fill: { fgColor: { rgb: S.totalsBg } },
        border: allBorders,
        numFmt: c.format ? numFmt[c.format] : undefined,
      })
    })
    r++
  }

  const totalRows = r
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Apply collected styles
  for (const rowKey of Object.keys(rowStyles)) {
    const rowIdx = Number(rowKey)
    for (const colKey of Object.keys(rowStyles[rowIdx])) {
      const colIdx = Number(colKey)
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      const style = rowStyles[rowIdx][colIdx]
      const { numFmt: nf, ...rest } = style
      ws[addr].s = rest
      if (nf) ws[addr].z = nf
    }
  }

  ws['!merges'] = merges
  ws['!rows'] = Array.from({ length: totalRows }, (_, i) => (i === 0 ? { hpt: 6 } : { hpt: 20 }))
  ws['!rows'][0] = { hpt: 6 }

  // Column widths: header length vs sampled content, with sane bounds
  ws['!cols'] = cols.map((c, ci) => {
    if (c.width) return { wch: c.width }
    let max = c.header.length + 2
    for (const row of sheet.rows.slice(0, 200)) {
      const v = row[c.key]
      const len = v == null ? 0 : String(v).length
      if (len > max) max = len
    }
    return { wch: Math.min(Math.max(max + 2, 10), 42) }
  })

  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 }
  // xlsx-js-style / SheetJS community uses !panes via sheetView; set both
  // freeze pane variants for broad Excel/LibreOffice compatibility.
  ws['!view'] = { rightToLeft: true }
  ;(ws as any)['!sheetPr'] = { ...(ws as any)['!sheetPr'] }

  return ws
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportStyledExcel(opts: ExcelWorkbookOptions) {
  // ⚡ Lazy: download/parse the ~870KB xlsx engine only when an export
  // actually runs (see the PERF FIX note at the top of this file).
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()
  ;(wb as any).Workbook = { Views: [{ RTL: true }] }

  const used = new Set<string>()
  for (const sheet of opts.sheets) {
    const ws = buildSheet(XLSX, sheet, opts.shop, opts.documentTitle, opts.periodLabel)
    const name = sanitizeSheetName(sheet.name, used)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  XLSX.writeFile(wb, opts.fileName, { compression: true })
}

/** Convenience for the common case: one table, one sheet. */
export function exportSimpleExcel(params: {
  fileName: string
  shop: { name?: string; phone?: string; address?: string }
  documentTitle: string
  periodLabel?: string
  sheetName?: string
  columns: ExcelColumn[]
  rows: Record<string, any>[]
  totals?: Record<string, any>
}) {
  return exportStyledExcel({
    fileName: params.fileName,
    shop: params.shop,
    documentTitle: params.documentTitle,
    periodLabel: params.periodLabel,
    sheets: [
      {
        name: params.sheetName || 'البيانات',
        columns: params.columns,
        rows: params.rows,
        totals: params.totals,
      },
    ],
  })
}

/** Builds a safe, date-stamped file name, e.g. "منتجات-2026-07-19.xlsx" */
export function excelFileName(base: string) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const clean = base.replace(/[\\/*?:[\]]/g, '-')
  return `${clean}-${stamp}.xlsx`
}
