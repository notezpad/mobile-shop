'use client'

/**
 * 🧠 2026-10-22 — معالج «الاستيراد الذكي للمنتجات الافتتاحية» من Excel
 *
 * 4 خطوات:
 *   ① رفع الملف (سحب وإفلات) + قالب جاهز للتحميل
 *   ② الأعمدة — النظام بيكتشف مطابقة كل عمود تلقائيًا والعميل يقدر يعدلها
 *   ③ المراجعة — كل صف بحالته: سليم / اتصلح تلقائيًا / تحذير / خطأ
 *      + سياسة المنتجات الموجودة (دمج كميات / تخطي / دمج + تحديث سعر)
 *   ④ التنفيذ والنتيجة — تم إنشاء X / اتدمج Y / اتخطى Z / فشل W
 *
 * ملاحظات أمان:
 *  - رفع الملف ينفّذ fetch مباشر (FormData) — طبقة الأوفلاين بترفضه عمداً.
 *  - الالتزام (commit) بينفذ بمفتاح Idempotency-Key ثابت لكل جلسة استيراد —
 *    لو الرد ضاع بعد التنفيذ وإعادة المحاولة حصلت، السيرفر يرجع نفس الرد
 *    بدل ما يستورد مرتين. + زر التنفيذ يتقفل أثناء العمل.
 *  - كل حاجة بتعدي على تحقق السيرفر تاني — الواجهة للعرض فقط.
 */

import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Download,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { IMPORT_FIELDS, FIELD_LABELS, type ImportField, type ParsedRow, type ImportStats } from '@/lib/smart-import'

// ─────────────────────────────────────────────────────────────────────────────
// أنواع رد الـ API
// ─────────────────────────────────────────────────────────────────────────────

interface SheetInfo {
  name: string
  rows: number
  headerRow: number
  matchedFields: number
}

interface AnalyzeResponse {
  sheetName?: string
  sheetsInfo?: SheetInfo[]
  headers: string[]
  rows: string[][]
  mapping: Partial<Record<ImportField, number>>
  confidence: Partial<Record<ImportField, number>>
  autoDetected: ImportField[]
  validation: { rows: ParsedRow[]; stats: ImportStats; mappingIssues: string[] }
  plan: { remaining: number | null; limit: number | null }
}

interface CommitResponse {
  created: number
  merged: number
  skippedExisting: number
  limitHit: number
  failed: number
  totalQtyAdded: number
  results: { idx: number; name: string; status: string; message?: string }[]
  mappingIssues: string[]
  blankRows: number
}

type MergeMode = 'add' | 'skip' | 'update'

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ok: { label: 'سليم', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  fixed: { label: 'اتصلح تلقائياً', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  warn: { label: 'به تنبيه', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  error: { label: 'خطأ', cls: 'bg-red-100 text-red-800 border-red-200' },
  blank: { label: 'فاضي', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

// ─────────────────────────────────────────────────────────────────────────────
// قالب الإكسيل الجاهز
// ─────────────────────────────────────────────────────────────────────────────

async function downloadTemplate() {
  const XLSX = await import('xlsx-js-style')
  const headers = ['اسم المنتج', 'الباركود', 'الكمية', 'سعر التكلفة', 'سعر البيع', 'التصنيف', 'وحدة القياس', 'حد التنبيه', 'الموسم', 'المعروض']
  const sample = [
    ['سكر 1 كيلو', '6221036123456', '10', '24', '28', 'بقالة', 'كيس', '2', '', ''],
    ['زيت عافية 1 لتر', '', '6', '95', '110', 'زيوت', 'زجاجة', '1', '', ''],
    ['شاي العروسة 250 جم', '', '20', '40', '48', 'بقالة', '', '3', '', ''],
    ['أرز مصري', '', '15', '22', '26', 'بقالة', '', '2', '', ''],
    ['مياه معدنية 1.5 لتر', '6221048123456', '48', '6', '8', 'مشروبات', '', '12', '', ''],
  ]
  const tips = [
    ['إزاي تستخدم القالب؟'],
    [''],
    ['1) اكتب منتجاتك تحت صف العناوين مباشرة — الصف الأخضر ده مينفعش يتشال'],
    ['2) الأعمدة ممكن تترتب بأي ترتيب أو تشيل منها اللي مش محتاجه — النظام بيفهم أسماء الأعمدة لوحده'],
    ['3) حتى لو الأعمدة عندك بأسماء مختلفة (مثلاً «الصنف» بدل «اسم المنتج») النظام بيتعرف عليها'],
    ['4) الأرقام ممكن تتهجى عربي (١٠) أو فيها فواصل (1,250) — النظام بيصلحها لوحده'],
    ['5) الكمية هنا = المخزون الافتتاحي: البضاعة القديمة اللي موجودة في المحل دلوقتي'],
    ['6) مهم: البضاعة القديمة تتسجل كـ«كمية افتتاحية» بالطريقة دي — مش كأمر شراء — عشان الخزنة ماتتخصمش غلط'],
    ['7) في النظام: صفحة المنتجات ← زر «استيراد ذكي» ← ارفع الملف ← راجع ← تنفيذ'],
    ['8) محلات الملابس: عمود «الموسم» (صيفي / شتوي / طوال السنة) وعمود «المعروض» (اللي هيقعد على الرف — الباقي يدخل المخزن الداخلي)'],
    [''],
    ['مسموح: xlsx / xls / csv — لحد 5 ميجا و 2000 صف في المرة'],
  ]
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws1['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, ws1, 'المنتجات')
  const ws2 = XLSX.utils.aoa_to_sheet(tips)
  ws2['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'تعليمات')
  XLSX.writeFile(wb, 'قالب-المنتجات-الافتتاحية-Nezam.xlsx')
}

// ─────────────────────────────────────────────────────────────────────────────
// المعالج
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImported: () => void
}

/** عدد صفوف المراجعة في الصفحة الواحدة */
const REVIEW_PAGE_SIZE = 50

export function ProductImportWizard({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = React.useState(1)
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [analysis, setAnalysis] = React.useState<AnalyzeResponse | null>(null)
  const [remapping, setRemapping] = React.useState(false)
  const [mergeMode, setMergeMode] = React.useState<MergeMode>('add')
  const [filter, setFilter] = React.useState<'all' | 'ok' | 'fixed' | 'warn' | 'error'>('all')
  // 📄 مراجعة الصفوف: بحث + ترقيم صفحات (الشيت ممكن يوصل 2000 صف — مش هنرسمهم كلهم)
  const [q, setQ] = React.useState('')
  const [page, setPage] = React.useState(0)
  const tableScrollRef = React.useRef<HTMLDivElement>(null)
  const [committing, setCommitting] = React.useState(false)
  const [commitResult, setCommitResult] = React.useState<CommitResponse | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const idemKeyRef = React.useRef<string>('')
  const remapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const stats = analysis?.validation.stats
  const importableCount = React.useMemo(() => {
    if (!stats) return 0
    return Math.max(0, stats.totalRows - stats.errors - stats.blank - stats.duplicatesInFile)
  }, [stats])

  const filteredRows = React.useMemo(() => {
    const rows = analysis?.validation.rows ?? []
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!needle) return true
      return (
        (r.name ?? '').toLowerCase().includes(needle) ||
        (r.barcode ?? '').toLowerCase().includes(needle) ||
        String(r.idx) === needle
      )
    })
  }, [analysis, filter, q])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / REVIEW_PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = React.useMemo(
    () => filteredRows.slice(safePage * REVIEW_PAGE_SIZE, (safePage + 1) * REVIEW_PAGE_SIZE),
    [filteredRows, safePage],
  )
  // أي تغيير في الفلتر/البحث/التحليل يرجّع لأول صفحة، وتغيير الصفحة يرجّع السكرول لفوق
  React.useEffect(() => { setPage(0) }, [filter, q, analysis])
  React.useEffect(() => { tableScrollRef.current?.scrollTo({ top: 0 }) }, [safePage, filter, q])

  const reset = React.useCallback(() => {
    setStep(1); setFile(null); setBusy(false); setError(null); setAnalysis(null)
    setRemapping(false); setMergeMode('add'); setFilter('all'); setQ(''); setPage(0); setCommitting(false)
    setCommitResult(null); setDragging(false)
    idemKeyRef.current = ''
  }, [])

  function close(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  // ── ① رفع وتحليل ──
  async function analyzeFile(f: File, preferredSheet?: string, keepMapping?: boolean) {
    setBusy(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (preferredSheet) fd.append('sheet', preferredSheet)
      if (keepMapping && analysis) fd.append('mapping', JSON.stringify(analysis.mapping))
      // fetch مباشر: طبقة الأوفلاين بتسحب FormData (أونلاين فقط عمداً)
      const res = await fetch('/api/products/import/analyze', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `فشل التحليل (${res.status})`)
      if (!idemKeyRef.current) {
        idemKeyRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `imp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      }
      setAnalysis(data)
      setStep(2)
    } catch (e: any) {
      setError(e?.message || 'فشل تحليل الملف')
    } finally {
      setBusy(false)
    }
  }

  function onPickFile(f: File | undefined | null) {
    if (!f) return
    setFile(f)
    setCommitResult(null)
    analyzeFile(f)
  }

  // ── ② إعادة التحقق عند تغيير المطابقة/السياسة (بدون إعادة رفع الملف) ──
  function scheduleRevalidate(nextMapping?: Partial<Record<ImportField, number>>, nextMerge?: MergeMode) {
    if (!analysis) return
    if (remapTimer.current) clearTimeout(remapTimer.current)
    remapTimer.current = setTimeout(async () => {
      setRemapping(true)
      try {
        const res = await fetch('/api/products/import/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headers: analysis.headers,
            rows: analysis.rows,
            mapping: nextMapping ?? analysis.mapping,
            mergeMode: nextMerge ?? mergeMode,
          }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data) {
          // نحافظ على معلومات الشيت من التحليل الأول (وضع JSON مش بيرجعها)
          const prevStats = analysis?.validation.stats
          if (data.validation?.stats && prevStats) {
            data.validation.stats = {
              ...data.validation.stats,
              junkRows: prevStats.junkRows,
              headerless: prevStats.headerless,
              truncated: prevStats.truncated,
            }
          }
          setAnalysis((prev) => (prev ? { ...prev, ...data, sheetsInfo: prev.sheetsInfo, sheetName: prev.sheetName } : data))
        }
      } catch { /* تحديث الواجهة فقط — الخطأ الحقيقي بيتكشف عند التنفيذ */ }
      finally { setRemapping(false) }
    }, 350)
  }

  function setFieldMapping(field: ImportField, colStr: string) {
    if (!analysis) return
    const next: Partial<Record<ImportField, number>> = { ...analysis.mapping }
    if (colStr === 'none') delete next[field]
    else {
      const col = parseInt(colStr, 10)
      // العمود الواحد لحقل واحد — لو اتاخد من حقل تاني الحقل التاني يتفرغ
      for (const f of IMPORT_FIELDS) if (f !== field && next[f] === col) delete next[f]
      next[field] = col
    }
    setAnalysis({ ...analysis, mapping: next, autoDetected: analysis.autoDetected.filter((f) => f !== field) })
    scheduleRevalidate(next)
  }

  // ── ④ التنفيذ ──
  async function commit() {
    if (!analysis) return
    setCommitting(true); setError(null)
    try {
      const res = await fetch('/api/products/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKeyRef.current || 'import-fallback-key-0001',
        },
        body: JSON.stringify({
          headers: analysis.headers,
          rows: analysis.rows,
          mapping: analysis.mapping,
          mergeMode,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `فشل التنفيذ (${res.status})`)
      setCommitResult(data)
      setStep(4)
      if (data.created > 0 || data.merged > 0) onImported()
    } catch (e: any) {
      setError(e?.message || 'فشل تنفيذ الاستيراد')
    } finally {
      setCommitting(false)
    }
  }

  // ── العرض ──
  const canProceed = Boolean(analysis && analysis.mapping.name !== undefined)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={cn(
          'flex max-h-[92vh] flex-col overflow-hidden p-0 transition-[width,max-width] duration-200 sm:rounded-2xl',
          // المراجعة: ارتفاع ثابت → الجدول بياخد المتاح وسياسة الدمج تفضل ظاهرة تحته دايمًا
          step === 3 && 'h-[min(92vh,780px)]',
          // الخطوتان 1 و4 (رفع/نتيجة) محتواهم خفيف → عرض متوسط؛ 2 و3 فيهم جداول → عرض أكبر
          step === 2 || step === 3
            ? 'w-[min(96vw,880px)] max-w-[880px] sm:max-w-[880px]'
            : 'w-[min(96vw,680px)] max-w-[680px] sm:max-w-[680px]',
        )}
      >
        {/* الترويسة */}
        <div className="flex items-center gap-3 border-b bg-gradient-to-l from-violet-50 to-sky-50 px-4 py-3 sm:px-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/30">
            <Wand2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold leading-snug sm:truncate sm:text-lg">الاستيراد الذكي — المنتجات الافتتاحية من Excel</h2>
            <p className="text-[11px] leading-snug text-muted-foreground sm:truncate sm:text-[13px]">
              ارفع شيت المنتجات القديمة — النظام بيفهم الأعمدة لوحده
            </p>
          </div>
          <button
            onClick={() => close(false)}
            aria-label="إغلاق"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* مؤشر الخطوات */}
        <div className="flex items-center gap-1 border-b bg-muted/40 px-4 py-2 sm:px-5">
          {['رفع الملف', 'الأعمدة', 'المراجعة', 'النتيجة'].map((label, i) => {
            const n = i + 1
            const active = step === n
            const done = step > n
            return (
              <React.Fragment key={label}>
                {i > 0 && <div className={cn('h-px flex-1', done ? 'bg-violet-400' : 'bg-border')} />}
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
                      active && 'bg-violet-600 text-white shadow shadow-violet-600/40',
                      done && 'bg-violet-100 text-violet-700',
                      !active && !done && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? '✓' : n}
                  </span>
                  <span className={cn('hidden text-xs sm:inline', active ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                    {label}
                  </span>
                </div>
              </React.Fragment>
            )
          })}
        </div>

        {/* المحتوى */}
        <div className={cn('min-h-0 flex-1 px-4 py-4 sm:px-5', step === 3 ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ═══ ① رفع الملف ═══ */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                aria-label="اختيار ملف الإكسيل"
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragging(false)
                  onPickFile(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
                  dragging ? 'border-violet-500 bg-violet-50' : 'border-border hover:border-violet-400 hover:bg-violet-50/50',
                  busy && 'pointer-events-none opacity-70',
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-10 animate-spin text-violet-600" />
                    <p className="font-bold">بيفهم الشيت بتاعك… (بيكشف الأعمدة ويصلح الأخطاء)</p>
                    <p className="text-xs text-muted-foreground">ملفات كبيرة ممكن تاخد ثواني</p>
                  </>
                ) : (
                  <>
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                      <Upload className="size-7" />
                    </div>
                    <div>
                      <p className="font-extrabold">اسحب ملف الإكسيل هنا أو اضغط للاختيار</p>
                      <p className="mt-1 text-xs text-muted-foreground">xlsx / xls / csv — لحد 5 ميجا و 2000 صف في المرة</p>
                    </div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    onPickFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" onClick={() => downloadTemplate()} className="h-10">
                  <Download className="size-4" />
                  تحميل قالب جاهز
                </Button>
                <p className="text-xs text-muted-foreground sm:max-w-[55%] sm:text-start">
                  مش متأكد من شكل الشيت؟ عادي — حتى لو أعمدتك اسمها «الصنف» أو «الموجود» أو أرقامك مكتوبة
                  <span dir="ltr"> (١٠) </span>
                  النظام بيتعرف عليها ويصلحها لوحده.
                </p>
              </div>

              <div className="rounded-xl border bg-card p-3 text-[13px] leading-relaxed text-muted-foreground">
                <p className="mb-1 flex items-center gap-1.5 font-bold text-foreground">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  إزاي الكميات بتتسجل؟
                </p>
                كل منتج هيبقى كميته <b>مخزون افتتاحي</b> بحركة «رصيد افتتاحي» — زي ما تضيف منتج من صفحته بالكمية بالظبط.
                <b className="text-red-700"> مش هيتم خصم أي حاجة من الخزنة ولا هيتسجل أي أمر شراء وهمي.</b>
              </div>
            </div>
          )}

          {/* ═══ ② الأعمدة ═══ */}
          {step === 2 && analysis && (
            <div className="space-y-4">
              {/* الشيتات */}
              {analysis.sheetsInfo && analysis.sheetsInfo.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
                  <span className="text-xs font-bold text-muted-foreground">الملف فيه {analysis.sheetsInfo.length} شيتات — الشيت الحالي:</span>
                  {analysis.sheetsInfo.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => file && analyzeFile(file, s.name, true)}
                      disabled={busy}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                        s.name === analysis.sheetName
                          ? 'border-violet-500 bg-violet-100 text-violet-800'
                          : 'bg-card text-muted-foreground hover:border-violet-400',
                      )}
                    >
                      <FileSpreadsheet className="me-1 inline size-3.5" />
                      {s.name} ({s.rows} صف)
                    </button>
                  ))}
                </div>
              )}

              {/* ملاحظات فهم الشيت */}
              <div className="space-y-1.5 text-[13px]">
                {analysis.validation.stats.junkRows > 0 && (
                  <p className="flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    اتشالت {analysis.validation.stats.junkRows} صفوف عناوين/زخارف فوق الجدول تلقائياً
                  </p>
                )}
                {analysis.validation.stats.headerless && (
                  <p className="flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="size-4" />
                    الشيت ده ملوش صف عناوين — حدد إيه اللي في كل عمود من القايمة تحت
                  </p>
                )}
                {analysis.validation.stats.truncated && (
                  <p className="flex items-center gap-1.5 text-orange-700">
                    <AlertTriangle className="size-4" />
                    الملف فيه أكتر من 2000 صف — اتعمل استيراد لأول 2000 صف بس. قسّم الملف لو عندك أكتر.
                  </p>
                )}
                {analysis.plan.remaining !== null && (
                  <p className="flex items-center gap-1.5 text-sky-700">
                    <Sparkles className="size-4" />
                    باقتك بتسمح بإضافة {analysis.plan.remaining} منتج جديد — اللي فوق كده هيتم دمجه في الموجود أو يتخطى
                  </p>
                )}
              </div>

              {/* خريطة الأعمدة */}
              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-bold">
                  <Table2 className="size-4 text-violet-600" />
                  إيه اللي في كل عمود؟ (النظام خمّن لوحده — عدّل لو محتاج)
                  {remapping && <Loader2 className="size-3.5 animate-spin text-violet-600" />}
                </div>
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                  {IMPORT_FIELDS.map((field) => {
                    const col = analysis.mapping[field]
                    const auto = analysis.autoDetected.includes(field)
                    return (
                      <div key={field} className={cn('rounded-lg border p-2.5', field === 'name' && !col ? 'border-red-300 bg-red-50' : 'bg-card')}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold">
                            {FIELD_LABELS[field]}
                            {field === 'name' && <span className="text-red-600"> *</span>}
                          </span>
                          {auto && col !== undefined && (
                            <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700" variant="outline">
                              ✓ اكتشاف تلقائي
                            </Badge>
                          )}
                        </div>
                        <Select value={col !== undefined ? String(col) : 'none'} onValueChange={(v) => setFieldMapping(field, v)}>
                          <SelectTrigger className="h-9 w-full bg-background text-[13px]">
                            <SelectValue placeholder="اختار العمود" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">— تجاهل —</span>
                            </SelectItem>
                            {analysis.headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {h} <span className="text-muted-foreground">(عمود {i + 1})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {analysis.validation.mappingIssues.map((msg) => (
                <p key={msg} className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-bold text-red-800">
                  <AlertTriangle className="size-4" /> {msg}
                </p>
              ))}
            </div>
          )}

          {/* ═══ ③ المراجعة ═══ */}
          {step === 3 && analysis && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {/* عدادات الحالة (بتشتغل كفلاتر) */}
              <div className="grid shrink-0 grid-cols-2 gap-2 max-sm:[&>button:last-child]:col-span-2 sm:grid-cols-5">
                <StatusCard n={stats!.ok} label="سليم" cls="text-emerald-700 bg-emerald-50 border-emerald-200" onClick={() => setFilter('ok')} active={filter === 'ok'} />
                <StatusCard n={stats!.fixed} label="هيتصلحوا تلقائياً" cls="text-amber-700 bg-amber-50 border-amber-200" onClick={() => setFilter('fixed')} active={filter === 'fixed'} />
                <StatusCard n={stats!.warn} label="تنبيهات" cls="text-orange-700 bg-orange-50 border-orange-200" onClick={() => setFilter('warn')} active={filter === 'warn'} />
                <StatusCard n={stats!.errors} label="أخطاء (مش هيدخلوا)" cls="text-red-700 bg-red-50 border-red-200" onClick={() => setFilter('error')} active={filter === 'error'} />
                <StatusCard n={importableCount} label="هيتستوردوا فعلاً" cls="text-violet-700 bg-violet-50 border-violet-200" onClick={() => setFilter('all')} active={filter === 'all'} />
              </div>

              {/* تحذيرات عامة */}
              {stats!.existsInDb > 0 && (
                <p className="shrink-0 rounded-lg bg-sky-50 px-3 py-1.5 text-[12px] leading-5 text-sky-900">
                  <b>{stats!.existsInDb}</b> منتج موجودين أصلًا في نظامك (بالباركود أو الاسم) — اختار تحت هنعمل معاهم إيه. ولو في منتهم موقوف، هيرجع يشتغل تلقائيًا عند الدمج.
                </p>
              )}
              {stats!.duplicatesInFile > 0 && (
                <p className="shrink-0 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] leading-5 text-amber-900">
                  <b>{stats!.duplicatesInFile}</b> صفوف مكررة داخل الملف — كمياتهم هتتجمع تلقائياً مع أول صف لنفس المنتج.
                </p>
              )}

              {/* شريط البحث + الترقيم */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث بالاسم أو الباركود أو رقم الصف…"
                    aria-label="بحث في صفوف المراجعة"
                    className="h-9 w-full rounded-lg border bg-background ps-8 pe-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-violet-400/50"
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {filteredRows.length === 0
                    ? 'لا توجد صفوف'
                    : `${safePage * REVIEW_PAGE_SIZE + 1}–${Math.min((safePage + 1) * REVIEW_PAGE_SIZE, filteredRows.length)} من ${filteredRows.length}`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage <= 0}
                    aria-label="الصفحة السابقة"
                    className="flex size-9 items-center justify-center rounded-lg border bg-background hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                  <span className="min-w-14 text-center text-xs font-bold tabular-nums">{safePage + 1} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage >= totalPages - 1}
                    aria-label="الصفحة التالية"
                    className="flex size-9 items-center justify-center rounded-lg border bg-background hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                </div>
              </div>

              {/* جدول الصفوف: بياخد المساحة المتاحة ويسكرول لوحده */}
              <div ref={tableScrollRef} className="min-h-[140px] flex-1 overflow-y-auto overscroll-contain rounded-xl border">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_var(--border)]">
                    <tr className="text-start text-xs text-muted-foreground">
                      <th className="w-12 px-2 py-2 text-start font-bold">#</th>
                      <th className="px-2 py-2 text-start font-bold">المنتج</th>
                      <th className="px-2 py-2 text-start font-bold">الكمية</th>
                      <th className="hidden px-2 py-2 text-start font-bold sm:table-cell">التكلفة</th>
                      <th className="hidden px-2 py-2 text-start font-bold sm:table-cell">البيع</th>
                      <th className="px-2 py-2 text-start font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => <ReviewRow key={r.idx} row={r} />)}
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          مفيش صفوف مطابقة — غيّر الفلتر أو البحث
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* سياسة الموجود — ثابتة تحت الجدول وظاهرة دايمًا */}
              <div className="shrink-0 rounded-xl border bg-card p-2.5">
                <p className="mb-1.5 text-[13px] font-bold">لو المنتج موجود أصلًا في النظام (بالباركود أو الاسم):</p>
                <RadioGroup value={mergeMode} onValueChange={(v) => { setMergeMode(v as MergeMode); scheduleRevalidate(undefined, v as MergeMode) }} className="grid gap-2 sm:grid-cols-3">
                  <MergeOption value="add" title="دمج الكمية" desc="كمية الشيت هتتضاف على المخزون الحالي" recommended />
                  <MergeOption value="update" title="دمج + تحديث سعر" desc="الكمية تتضاف + السعر والتكلفة يتحدثوا من الشيت" />
                  <MergeOption value="skip" title="تخطي الموجود" desc="المنتجات الموجودة مش هتتلمس خالص" />
                </RadioGroup>
              </div>
            </div>
          )}

          {/* ═══ ④ النتيجة ═══ */}
          {step === 4 && committing && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-10 animate-spin text-violet-600" />
              <p className="font-bold">بنستورد المنتجات… متقفلش الصفحة</p>
            </div>
          )}
          {step === 4 && !committing && commitResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ResultCard n={commitResult.created} label="منتج جديد اتعمل" cls="text-emerald-700 bg-emerald-50 border-emerald-200" />
                <ResultCard n={commitResult.merged} label="اتدمجوا في الموجود" cls="text-sky-700 bg-sky-50 border-sky-200" />
                <ResultCard n={commitResult.skippedExisting + commitResult.limitHit} label="اتخطوا" cls="text-zinc-700 bg-zinc-50 border-zinc-200" />
                <ResultCard n={commitResult.failed} label="فشلوا" cls="text-red-700 bg-red-50 border-red-200" />
              </div>
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-900">
                <ShieldCheck className="me-1.5 inline size-4" />
                إجمالي الكميات الافتتاحية اللي دخلت المخزون: {commitResult.totalQtyAdded} — كلها اتحسبت «رصيد افتتاحي» بدون أي خصم من الخزنة وبدون أي أوامر شراء.
              </p>
              {commitResult.limitHit > 0 && (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
                  {commitResult.limitHit} صف اتعديلوا بسبب حد باقتك — رقّي الباقة أو استوردهم بعد ما تمسح منتجات.
                </p>
              )}
              {commitResult.results.filter((r) => r.status === 'failed').length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                  <p className="mb-1.5 text-[13px] font-bold text-red-900">الصفوف اللي فشلت وسبيله:</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-800">
                    {commitResult.results.filter((r) => r.status === 'failed').slice(0, 30).map((r, i) => (
                      <li key={i}>• صف {r.idx} {r.name && `(${r.name})`}: {r.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => close(false)} className="h-10 flex-1">
                  <CheckCircle2 className="size-4" />
                  تمام — قفل
                </Button>
                <Button variant="outline" onClick={reset} className="h-10 flex-1">
                  <Upload className="size-4" />
                  استيراد ملف تاني
                </Button>
              </div>
            </div>
          )}
          {step === 4 && !committing && !commitResult && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <CircleSlash className="size-8" />
              <p className="text-sm">الاستيراد لسه ما اتنفذش — ارجع لخطوة المراجعة واضغط «تنفيذ»</p>
            </div>
          )}
        </div>

        {/* التذييل — أزرار التنقل */}
        {step < 4 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-nowrap sm:px-5">
            <Button variant="outline" onClick={() => (step === 1 ? close(false) : setStep(step - 1))} disabled={busy || committing} className="h-10">
              {step === 1 ? 'إلغاء' : 'السابق'}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {stats && step >= 2 && (
                <span className="hidden sm:inline">
                  {stats.totalRows} صف • كمية افتتاحية {stats.totalQty}
                </span>
              )}
              {step === 2 ? (
                <Button onClick={() => setStep(3)} disabled={!canProceed || busy} className="h-10 min-w-32 sm:min-w-36">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  راجع البيانات
                </Button>
              ) : step === 3 ? (
                <Button onClick={commit} disabled={committing || importableCount === 0} className="h-10 min-w-36 sm:min-w-40">
                  {committing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  تنفيذ الاستيراد ({importableCount})
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// عناصر مساعدة صغيرة
// ─────────────────────────────────────────────────────────────────────────────

function StatusCard({ n, label, cls, onClick, active }: { n: number; label: string; cls: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-xl border px-3 py-2 text-center transition-all hover:shadow-sm', cls, active && 'ring-2 ring-violet-400 ring-offset-1')}
    >
      <div className="text-lg font-extrabold leading-none">{n}</div>
      <div className="mt-1 text-[11px] font-bold leading-tight">{label}</div>
    </button>
  )
}

function ResultCard({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={cn('rounded-xl border px-3 py-3 text-center', cls)}>
      <div className="text-2xl font-extrabold leading-none">{n}</div>
      <div className="mt-1 text-xs font-bold">{label}</div>
    </div>
  )
}

function MergeOption({ value, title, desc, recommended }: { value: string; title: string; desc: string; recommended?: boolean }) {
  return (
    <div className="relative flex items-start gap-2 rounded-lg border p-2.5 has-[[data-state=checked]]:border-violet-500 has-[[data-state=checked]]:bg-violet-50">
      <RadioGroupItem value={value} id={`mm-${value}`} className="mt-0.5" />
      <label htmlFor={`mm-${value}`} className="cursor-pointer">
        <span className="block text-[13px] font-bold">
          {title}
          {recommended && <Badge className="ms-1.5 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700" variant="outline">الأسرع</Badge>}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </label>
    </div>
  )
}

const ReviewRow = React.memo(function ReviewRow({ row }: { row: ParsedRow }) {
  const meta = STATUS_META[row.status] ?? STATUS_META.blank
  const notes = [
    ...row.errors.map((e) => ({ text: e, cls: 'text-red-700' })),
    ...row.warnings.map((w) => ({ text: w, cls: 'text-orange-700' })),
    ...row.fixes.map((f) => ({ text: f, cls: 'text-amber-700' })),
  ]
  return (
    <tr className={cn('border-t align-top', row.status === 'error' && 'bg-red-50/50', row.status === 'blank' && 'opacity-50')}>
      <td className="px-2 py-2 text-xs text-muted-foreground">{row.idx}</td>
      <td className="max-w-[220px] px-2 py-2">
        <span className="block truncate font-bold">{row.name || <span className="text-muted-foreground">— بدون اسم —</span>}</span>
        {row.existsInDb && (
          <span className="mt-0.5 block text-[11px] text-sky-700">
            موجود بالنظام: «{row.existsInDb.name}»{!row.existsInDb.active && <span className="font-bold text-orange-700"> (موقوف — هيترجّع يشتغل عند الدمج)</span>}
          </span>
        )}
        {notes.slice(0, 2).map((n, i) => (
          <span key={i} className={cn('mt-0.5 block text-[11px] leading-snug', n.cls)}>{n.text}</span>
        ))}
        {notes.length > 2 && <span className="mt-0.5 block text-[11px] text-muted-foreground">+{notes.length - 2} ملاحظات إضافية</span>}
      </td>
      <td className="px-2 py-2 font-bold">{row.status !== 'blank' ? row.quantity : '—'}</td>
      <td className="hidden px-2 py-2 sm:table-cell">{row.cost ?? '—'}</td>
      <td className="hidden px-2 py-2 sm:table-cell">{row.price ?? '—'}</td>
      <td className="px-2 py-2">
        <Badge variant="outline" className={cn('text-[11px]', meta.cls)}>{meta.label}</Badge>
      </td>
    </tr>
  )
})
