'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useShopStore } from '@/lib/store'
import { STOCK_POLICY, reasonLabelsFor } from '@/lib/stock-policy'
import { unitWord } from '@/lib/unit-label'
import {
  Search,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat,
  MapPin,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Barcode } from '../Barcode'
import { NoBarcode } from '../NoBarcode'
import { ProductAvatar } from '../ProductAvatar'
import { StockHero, TONE, SecLabel, Pill, STOCK_FIELD, STOCK_RING, type StockTone } from './stock-dialog-ui'
import { num } from './shared'
import { PurchaseVariantsDialog, type PurchaseVariantLite, type PurchaseVariantsResult } from '../PurchaseVariantsDialog'
import type { Branch, InventoryProduct } from '../InventoryView'

interface Props {
  products: InventoryProduct[]
  branches: Branch[]
  isEmployee: boolean
  userBranchId: number | null
  onChanged: () => void
}

// 📋 2026-10-18: الأسباب بقت أكواد محددة على السيرفر (lib/stock-policy) — القوايم هنا بتتقرا
// منه عشان الواجهة والسيرفر مايختلفوش. «استلام بضاعة» و«مرتجع مورد» و«تالف» ماعادوش أسباب
// يدوية: كل واحد ليه مكانه الصح (أمر شراء / مرتجع مورد / زر الهالك) عشان الدين والتكلفة
// والخسارة تتسجل.
const reasonsFor = (type: 'in' | 'out' | 'damage') =>
  type === 'damage' ? DAMAGE_REASONS : reasonLabelsFor(type)

// 🛡️ 2026-09-30: أسباب مخصصة لتسجيل الهالك — الخسارة بتتسجل بقيمتها في
// المصروفات (فئة "هالك وتالف") والسبب بيتكتب في الحركة والمصروف.
const DAMAGE_REASONS = [
  'تالف / هالك',
  'انتهاء صلاحية',
  'تلف التخزين (رطوبة/حرارة)',
  'تلف أثناء النقل',
  'عيوب صناعة',
  'أخرى',
]

/* ───────────── جدول الأصناف (ديسكتوب) — مساعدات ───────────── */

type StockState = 'out' | 'low' | 'ok'
type SortKey = 'name' | 'quantity' | 'cost' | 'price' | 'value'
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null

const stockState = (p: InventoryProduct): StockState =>
  p.quantity <= 0 ? 'out' : p.quantity <= p.minQuantity ? 'low' : 'ok'

// نفس ألوان حالة المخزون المستخدمة في صفحة المنتجات
const STOCK_UI: Record<StockState, { label: string; bar: string; text: string; chip: string; stripe: string; row: string }> = {
  out: {
    label: 'نفد',
    bar: 'bg-destructive',
    text: 'text-destructive',
    chip: 'bg-destructive/10 text-destructive',
    stripe: 'bg-destructive',
    row: 'bg-destructive-subtle/30',
  },
  low: {
    label: 'منخفض',
    bar: 'bg-warning',
    text: 'text-warning-subtle-foreground',
    chip: 'bg-warning-subtle text-warning-subtle-foreground',
    stripe: 'bg-warning',
    row: 'bg-warning-subtle/25',
  },
  ok: {
    label: 'متوفر',
    bar: 'bg-success',
    text: 'text-success-subtle-foreground',
    chip: 'bg-success-subtle text-success-subtle-foreground',
    stripe: 'bg-transparent',
    row: '',
  },
}

/** عدّاد مخزون من 10 خانات: الهدف = ٣ أضعاف الحد الأدنى (أو الكمية الحالية لو أكبر). */
function StockMeter({ p }: { p: InventoryProduct }) {
  const st = stockState(p)
  const target = Math.max(p.minQuantity * 3, p.quantity, 1)
  const filled = p.quantity <= 0 ? 0 : Math.min(10, Math.max(1, Math.round((p.quantity / target) * 10)))
  return (
    <div
      role="meter"
      aria-label="مستوى المخزون"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.max(0, p.quantity)}
      className="flex h-1.5 gap-[3px]"
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={cn('flex-1 rounded-full', i < filled ? STOCK_UI[st].bar : 'bg-foreground/10')} />
      ))}
    </div>
  )
}

// رأس عمود ثابت أثناء السكرول (solid عشان الصفوف ما تبانش من تحته)
const HEAD_CELL = 'sticky top-0 z-10 h-11 bg-muted'

function SortHead({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string
  k: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort?.key === k
  return (
    <TableHead
      className={cn(HEAD_CELL, className)}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          active && 'text-foreground',
        )}
      >
        {label}
        {active ? (
          sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

export function StockTab({ products, branches, isEmployee, userBranchId, onChanged }: Props) {
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [adjOpen, setAdjOpen] = React.useState<{ product: InventoryProduct; type: 'in' | 'out' | 'damage' } | null>(null)
  const [exchangeOpen, setExchangeOpen] = React.useState(false)

  const filtered = React.useMemo(() => {
    return products.filter(p => {
      // Branch filter
      if (branchFilter !== 'all') {
        if (branchFilter === 'none' && p.branchId != null) return false
        if (branchFilter !== 'none' && p.branchId !== parseInt(branchFilter, 10)) return false
      }
      // Status filter
      if (statusFilter === 'low' && !(p.quantity > 0 && p.quantity <= p.minQuantity)) return false
      if (statusFilter === 'out' && p.quantity > 0) return false
      if (statusFilter === 'ok' && p.quantity <= p.minQuantity) return false
      // Search
      if (search) {
        const q = search.trim().toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [products, branchFilter, statusFilter, search])

  const branchName = (id: number | null) => branches.find(b => b.id === id)?.name

  // ترتيب جدول الديسكتوب: ضغطة = تصاعدي، تانية = تنازلي، تالتة = رجوع للترتيب الأصلي
  const [sort, setSort] = React.useState<SortState>(null)
  const onSort = (key: SortKey) =>
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })

  const rows = React.useMemo(() => {
    if (!sort) return filtered
    const val = (p: InventoryProduct) =>
      sort.key === 'name' ? p.name
      : sort.key === 'quantity' ? p.quantity
      : sort.key === 'cost' ? (p.cost ?? 0)
      : sort.key === 'price' ? p.price
      : p.quantity * (p.cost ?? 0)
    const m = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b)
      return (typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'ar') : (x as number) - (y as number)) * m
    })
  }, [filtered, sort])

  // ملخص القائمة الحالية (بعد الفلاتر)
  const summary = React.useMemo(() => {
    let ok = 0, low = 0, out = 0, qty = 0, value = 0
    for (const p of filtered) {
      const st = stockState(p)
      if (st === 'ok') ok++
      else if (st === 'low') low++
      else out++
      qty += Math.max(0, p.quantity)
      value += Math.max(0, p.quantity) * Math.max(0, p.cost ?? 0)
    }
    return { ok, low, out, qty, value }
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* 📱 2026-10-07: الفلاتر — نفس نمط باقي الموقع (المنتجات):
          على الجوال شبكة 2×2 — البحث بعرض كامل، والفرع + الحالة جنب بعض،
          ومن sm+ وفوق يرجع صف أفقي زي الأصل. مفيش عناصر مكدّسة عمودي. */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-2 p-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:p-3">
          <div className="relative col-span-2 min-w-0 sm:min-w-[220px] sm:flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="اكتب اسم المنتج أو الباركود..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 rounded-xl border-0 bg-muted/60 pe-9 ps-9 shadow-none focus-visible:bg-background"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="مسح البحث"
                className="absolute left-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground hover:bg-foreground/20"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          {!isEmployee && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger
                aria-label="الفرع"
                className="h-10 w-full min-w-0 rounded-xl border-0 bg-muted/60 shadow-none sm:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                <SelectItem value="none">بدون فرع</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              aria-label="الحالة"
              className="h-10 w-full min-w-0 rounded-xl border-0 bg-muted/60 shadow-none sm:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="ok">متوفر</SelectItem>
              <SelectItem value="low">قارب على النفاذ</SelectItem>
              <SelectItem value="out">نفد</SelectItem>
            </SelectContent>
          </Select>
          {/* 🛡️ 2026-09-30: استبدال بضاعة مع مورد — بيخرج التالف ويدخل البديل
              وبيحسب فرق القيمة على حساب المورد تلقائياً */}
          {!isEmployee && (
            <Button variant="outline" className="h-10 w-full gap-1.5 sm:w-auto" onClick={() => setExchangeOpen(true)}>
              <Repeat className="size-4" />
              استبدال مورد
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-3.5">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Package className="size-4 text-primary" />
              قائمة الأصناف
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {num(filtered.length)} من {num(products.length)}
              </span>
            </span>
            {/* ملخص الحالات للقائمة الحالية — ديسكتوب فقط */}
            <span className="hidden items-center gap-1.5 text-xs font-semibold lg:flex">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', STOCK_UI.ok.chip)}>
                <span className="size-1.5 rounded-full bg-success" />
                متوفر <b className="tabular-nums">{num(summary.ok)}</b>
              </span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', STOCK_UI.low.chip)}>
                <span className="size-1.5 rounded-full bg-warning" />
                منخفض <b className="tabular-nums">{num(summary.low)}</b>
              </span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', STOCK_UI.out.chip)}>
                <span className="size-1.5 rounded-full bg-destructive" />
                نفد <b className="tabular-nums">{num(summary.out)}</b>
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* ═════════ جدول الأصناف — ديسكتوب (lg فأكثر) ═════════
              حاوية السكرول بتتحكم في الرأس والتذييل الثابتين (sticky)، والجدول جواها
              dir=rtl (نفس حل مكوّن Table) عشان السكرول الأفقي يفضل متوقّع. */}
          <div className="hidden lg:block">
            <div dir="ltr" className="max-h-[68vh] overflow-auto">
              <table dir="rtl" className="w-full min-w-[992px] table-fixed caption-bottom text-sm">
                <TableHeader className="bg-transparent">
                  <TableRow className="hover:bg-transparent">
                    <SortHead label="الصنف" k="name" sort={sort} onSort={onSort} />
                    <TableHead className={cn(HEAD_CELL, 'w-36')}>الباركود</TableHead>
                    <SortHead label="المخزون" k="quantity" sort={sort} onSort={onSort} className="w-44" />
                    <SortHead label="التكلفة" k="cost" sort={sort} onSort={onSort} className="w-24 text-center" />
                    <SortHead label="سعر البيع" k="price" sort={sort} onSort={onSort} className="w-28 text-center" />
                    <SortHead label="قيمة المخزون" k="value" sort={sort} onSort={onSort} className="w-28 text-center" />
                    <TableHead className={cn(HEAD_CELL, 'w-36 pe-5 text-center')}>حركة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-14 text-center text-muted-foreground">
                        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-muted">
                          <Package className="size-7 opacity-50" />
                        </span>
                        <p className="font-bold text-foreground/80">لا توجد منتجات مطابقة</p>
                        <p className="mt-1 text-xs">جرّب تغيّر البحث أو الفلاتر</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(p => {
                      const st = stockState(p)
                      const ui = STOCK_UI[st]
                      const out = st === 'out'
                      const bName = branchName(p.branchId)
                      const costHidden = p.cost == null // 🔒 RBAC
                      const margin = !costHidden && p.price > 0 ? Math.round(((p.price - (p.cost ?? 0)) / p.price) * 100) : null
                      const stockValue = Math.max(0, p.quantity) * Math.max(0, p.cost ?? 0)
                      return (
                        <TableRow key={p.id} className={cn('group hover:bg-muted/50', ui.row)}>
                          {/* الصنف: شريط حالة جانبي + صورة + اسم + تصنيف/فرع */}
                          <TableCell className="relative whitespace-normal">
                            <span aria-hidden className={cn('absolute inset-y-0 start-0 w-[3px]', ui.stripe)} />
                            <div className="flex items-center gap-3">
                              <ProductAvatar name={p.name} imagePath={p.imagePath} size="sm" />
                              <div className="min-w-0">
                                <p className="line-clamp-2 font-bold leading-snug [overflow-wrap:anywhere]" title={p.name}>
                                  {p.name}
                                </p>
                                <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  <span className="[overflow-wrap:anywhere]">{p.category || 'بدون تصنيف'}</span>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="size-3 shrink-0" />
                                    <span className="[overflow-wrap:anywhere]">{bName ?? 'بدون فرع'}</span>
                                  </span>
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          {/* الباركود */}
                          <TableCell>
                            {p.barcode ? <Barcode value={p.barcode} height={22} fontSize={9} fitContainer /> : <NoBarcode />}
                          </TableCell>

                          {/* المخزون: كمية + عدّاد + حالة */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className={cn('min-w-9 text-xl font-black leading-none tabular-nums', ui.text)}>
                                {num(Math.max(0, p.quantity))}
                                {p.unitLabel && <span className="ms-1 text-[10px] font-semibold text-muted-foreground">{unitWord(p.quantity, p.unitLabel)}</span>}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <StockMeter p={p} />
                                <p className="flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', ui.chip)}>{ui.label}</span>
                                  <span className="tabular-nums">الحد الأدنى {num(p.minQuantity)}</span>
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          {/* التكلفة */}
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {costHidden ? '—' : formatCurrency(p.cost)}
                          </TableCell>

                          {/* سعر البيع + هامش الربح */}
                          <TableCell className="text-center">
                            <p className="font-extrabold tabular-nums">{formatCurrency(p.price)}</p>
                            {margin !== null && (
                              <p
                                className={cn(
                                  'mt-0.5 text-[10px] font-semibold tabular-nums',
                                  margin < 0 ? 'text-destructive' : 'text-success-subtle-foreground',
                                )}
                              >
                                هامش {margin}%
                              </p>
                            )}
                          </TableCell>

                          {/* قيمة المخزون (كمية × تكلفة) */}
                          <TableCell className={cn('text-center font-bold tabular-nums', out && 'text-muted-foreground/60')}>
                            {costHidden ? '—' : formatCurrency(stockValue)}
                          </TableCell>

                          {/* إجراءات الحركة */}
                          <TableCell className="pe-5">
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-8 rounded-lg p-0 text-success-subtle-foreground hover:bg-success-subtle hover:text-success-subtle-foreground"
                                onClick={() => setAdjOpen({ product: p, type: 'in' })}
                                title="إضافة كمية (وارد)"
                                aria-label="إضافة كمية (وارد)"
                              >
                                <Plus className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-8 rounded-lg p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                                onClick={() => setAdjOpen({ product: p, type: 'out' })}
                                disabled={p.quantity <= 0}
                                title="خصم كمية (صادر)"
                                aria-label="خصم كمية (صادر)"
                              >
                                <Minus className="size-3.5" />
                              </Button>
                              {/* 🛡️ 2026-09-30: تسجيل هالك — بيسجّل الخسارة في المصروفات */}
                              {!isEmployee && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="size-8 rounded-lg p-0 text-warning-subtle-foreground hover:bg-warning-subtle hover:text-warning-subtle-foreground"
                                  onClick={() => setAdjOpen({ product: p, type: 'damage' })}
                                  disabled={p.quantity <= 0}
                                  title="تسجيل هالك (بيسجّل الخسارة في المصروفات)"
                                  aria-label="تسجيل هالك"
                                >
                                  <AlertTriangle className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
                {rows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t bg-muted text-sm font-bold">
                      <td colSpan={2} className="px-3 py-2.5 text-muted-foreground">
                        إجمالي القائمة الحالية · <span className="tabular-nums text-foreground">{num(filtered.length)}</span> صنف
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {num(summary.qty)} <span className="text-xs font-medium text-muted-foreground">قطعة</span>
                      </td>
                      <td colSpan={2} />
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {/* 🔒 RBAC: إجمالي قيمة التكلفة مخفي لو التكلفة مخفية */}
                        {filtered.some((p) => p.cost == null) ? '—' : formatCurrency(summary.value)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
            📱 v14: تصميم جوال مخصّص بستايل صفحة المخزون — التسمية فوق
            والقيمة تحتها (مش جنب بعض)، واسم المنتج بيلف بدل ما يتقص،
            والمبالغ المليونية بتتفضى كاملة من غير أي truncate.
          */}
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {filtered.length === 0 ? (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 size-8 opacity-40" />
                لا توجد منتجات مطابقة
              </p>
            ) : (
              filtered.map(p => {
                const out = p.quantity <= 0
                const low = !out && p.quantity <= p.minQuantity
                return (
                  <div
                    key={p.id}
                    className={
                      out
                        ? 'relative overflow-hidden rounded-2xl border border-destructive/25 bg-destructive-subtle/40 p-3.5'
                        : low
                        ? 'relative overflow-hidden rounded-2xl border border-amber-500/30 bg-warning-subtle/30 p-3.5'
                        : 'relative overflow-hidden rounded-2xl border bg-card p-3.5'
                    }
                  >
                    {/* رأس الكارت: اسم + إجراءات */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {/* v14: الاسم بيلف بالكامل — ممنوع القص بنقاط */}
                        <p className="font-bold leading-snug [overflow-wrap:anywhere]">{p.name}</p>
                        <p className="mt-1 flex min-w-0 items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{branchName(p.branchId) ?? 'بدون فرع'}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-8 p-0 text-success-subtle-foreground hover:bg-success-subtle hover:text-success-subtle-foreground"
                          onClick={() => setAdjOpen({ product: p, type: 'in' })}
                          title="إضافة كمية (وارد)"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-8 p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                          onClick={() => setAdjOpen({ product: p, type: 'out' })}
                          disabled={p.quantity <= 0}
                          title="خصم كمية (صادر)"
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        {!isEmployee && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0 text-warning-subtle-foreground hover:bg-warning-subtle hover:text-warning-subtle-foreground"
                            onClick={() => setAdjOpen({ product: p, type: 'damage' })}
                            disabled={p.quantity <= 0}
                            title="تسجيل هالك (بيسجّل الخسارة في المصروفات)"
                          >
                            <AlertTriangle className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* الباركود */}
                    <div className="mt-2.5 rounded-lg border bg-muted/30 py-1">
                      <Barcode value={p.barcode} height={24} fontSize={9} fitContainer />
                    </div>

                    {/* 📱 v14: بيانات الكارت — التسمية فوق والقيمة تحتها (الأسلوب
                        الصح اللي طلبته)، والمبالغ المليونية كاملة من غير قص */}
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                      {/* الكمية المتاحة */}
                      <div
                        className={cn(
                          'rounded-xl px-3 py-2',
                          out ? 'bg-destructive/10' : low ? 'bg-amber-500/10' : 'bg-emerald-500/[0.08]',
                        )}
                      >
                        <p className="text-[10px] font-semibold text-muted-foreground">الكمية المتاحة</p>
                        <p
                          className={cn(
                            'mt-0.5 text-base font-black leading-tight tabular-nums [overflow-wrap:anywhere]',
                            out
                              ? 'text-destructive'
                              : low
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400',
                          )}
                        >
                          {out ? 'نفدت' : p.unitLabel ? `${num(p.quantity)} ${unitWord(p.quantity, p.unitLabel)}` : num(p.quantity)}
                        </p>
                        {low && !out && (
                          <p className="mt-0.5 text-[10px] font-medium leading-snug text-amber-700/80 dark:text-amber-400/80">
                            وصلت للحد الأدنى
                          </p>
                        )}
                      </div>
                      {/* الحد الأدنى */}
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-[10px] font-semibold text-muted-foreground">الحد الأدنى</p>
                        <p className="mt-0.5 text-base font-bold leading-tight tabular-nums text-muted-foreground">
                          {num(p.minQuantity)}
                        </p>
                      </div>
                      {/* التكلفة */}
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-[10px] font-semibold text-muted-foreground">التكلفة</p>
                        <p className="mt-0.5 text-sm font-bold leading-tight tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
                          {p.cost == null ? '—' : formatCurrency(p.cost)}
                        </p>
                      </div>
                      {/* سعر البيع */}
                      <div className="rounded-xl bg-emerald-500/[0.08] px-3 py-2">
                        <p className="text-[10px] font-semibold text-emerald-700/70 dark:text-emerald-400/70">سعر البيع</p>
                        <p className="mt-0.5 text-sm font-extrabold leading-tight tabular-nums text-emerald-700 dark:text-emerald-400 [overflow-wrap:anywhere]">
                          {formatCurrency(p.price)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Adjust dialog (وارد / صادر / هالك) */}
      {adjOpen && (
        <AdjustDialog
          open={!!adjOpen}
          onOpenChange={(o) => !o && setAdjOpen(null)}
          product={adjOpen.product}
          type={adjOpen.type}
          onDone={onChanged}
        />
      )}

      {/* استبدال مع مورد */}
      {exchangeOpen && (
        <ExchangeDialog
          open={exchangeOpen}
          onOpenChange={setExchangeOpen}
          products={products}
          branches={branches}
          onDone={onChanged}
        />
      )}
    </div>
  )
}

/* ---------------- Adjust Dialog (وارد / صادر / هالك) ---------------- */

function AdjustDialog({
  open,
  onOpenChange,
  product,
  type,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: InventoryProduct
  type: 'in' | 'out' | 'damage'
  onDone: () => void
}) {
  const router = useRouter()
  const [qty, setQty] = React.useState('')
  const [reason, setReason] = React.useState(reasonsFor(type)[0])
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  // 🎨 المنتج اللي له ألوان/مقاسات: الحركة لازم تتحدد على لون/مقاس (وإلا الكمية بتتمسح)
  const isAdminUser = useShopStore((st) => st.user?.role === 'ADMIN' || st.user?.role === 'SUPER_ADMIN')
  const [variants, setVariants] = React.useState<{ id: number; size: string | null; color: string | null; quantity: number }[]>([])
  const [variantId, setVariantId] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setVariants([])
    setVariantId(null)
    api<{ id: number; size: string | null; color: string | null; quantity: number }[]>(`/api/products/${product.id}/variants`)
      .then((v) => { if (alive) setVariants(Array.isArray(v) ? v : []) })
      .catch(() => { /* منتج عادي أو أوفلاين — السيرفر هو الحاكم */ })
    return () => { alive = false }
  }, [open, product.id])

  const reasons = reasonsFor(type)
  const pickedVariant = variants.find((v) => v.id === variantId) ?? null
  // المخزون المرجعي: مخزون اللون/المقاس لو اتحدد، وإلا إجمالي المنتج
  const stockNow = pickedVariant ? pickedVariant.quantity : product.quantity

  // Reset fields whenever the dialog opens (keyed by product id + type)
  const resetKey = `${product.id}-${type}`
  const [lastResetKey, setLastResetKey] = React.useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setQty('')
    setReason(reasonsFor(type)[0])
    setNote('')
    setVariantId(null)
  }

  const qNum = parseInt(qty, 10) || 0
  // 🛡️ قيمة الخسارة المتوقعة = الكمية × التكلفة الحالية (المتوسط المرجح)
  const lossPreview = type === 'damage' && qNum > 0 && product.cost != null ? qNum * Math.max(0, product.cost) : 0

  // يفتح المشتريات (ولو منتج: يفتح أمر شراء جديد ومعبّي المنتج)
  // 🛡️ ROOT FIX (2026-10-19): الزر كان بينادي setActiveView بتاع الـ store —
  // ده كان شغال زمان لما كل الشاشات كانت في shell واحد، لكن /inventory
  // و /purchases بقوا صفحتين منفصلتين فعلياً في الـ App Router، فالنداء ده
  // مابيعملش أي حاجة مرئية والمستخدم يفضل واقف على المخزون. التنقل الصحيح
  // هو تنقل route حقيقي (نفس نمط Topbar: router.push).
  const goPurchases = (p: typeof product | null, mode: 'buy' | 'return' = 'buy') => {
    try {
      if (mode === 'buy' && p) {
        sessionStorage.setItem(
          'purchasePrefill',
          JSON.stringify({ id: p.id, name: p.name, barcode: p.barcode ?? null, cost: p.cost ?? 0, quantity: p.quantity ?? 0 }),
        )
      } else if (mode === 'return' && p) {
        // صادر: مفيش مرتجع مورد من غير أمر شراء — بنوجه للمشتريات مع فلتر
        // جاهز على أوامر الشراء اللي فيها الصنف ده + إرشاد واضح (بيتقري في PurchaseOrdersView)
        sessionStorage.setItem('purchaseReturnFocus', JSON.stringify({ name: p.name }))
      }
    } catch { /* sessionStorage غير متاح */ }
    onOpenChange(false)
    router.push('/purchases')
  }

  const submit = async () => {
    const q = parseInt(qty, 10)
    if (!q || q <= 0) { toast.error('كمية غير صالحة'); return }
    if (variants.length > 0 && variantId == null) { toast.error('اختار اللون/المقاس الأول'); return }
    // 📋 السبب إجباري لكل حركة (وارد وصادر وهالك) — و«أخرى» محتاجة ملاحظة (السيرفر بيتحقق كمان)
    if (!reason) { toast.error('اختار سبب الحركة'); return }
    if (reason === 'أخرى' && note.trim().length < 3) {
      toast.error('اكتب ملاحظة توضّح السبب')
      return
    }
    setSaving(true)
    try {
      await api('/api/inventory/movements', {
        method: 'POST',
        body: {
          productId: product.id,
          variantId: variantId ?? undefined,
          quantity: q,
          type,
          reason,
          note: note.trim() || undefined,
        },
      })
      if (type === 'damage') {
        toast.success(`تم تسجيل الهالك — خسارة ${formatCurrency(qNum * Math.max(0, product.cost))} اتسجلت في المصروفات`)
      } else {
        toast.success(
          type === 'in'
            ? 'تم تسجيل الكمية الواردة'
            : reason === 'هدايا/عينات'
              ? `تم خصم الكمية — خسارة ${formatCurrency(qNum * Math.max(0, product.cost))} اتسجلت في المصروفات`
              : 'تم خصم الكمية',
        )
      }
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const isIn = type === 'in'
  const isDamage = type === 'damage'
  const title = isDamage ? 'تسجيل هالك / تالف' : isIn ? 'إضافة كمية واردة' : 'خصم كمية صادرة'
  const tone: StockTone = type
  const t = TONE[tone]
  const after = isIn ? stockNow + qNum : stockNow - qNum
  const over = !isIn && qNum > stockNow
  // 🎨 منتج له مقاسات ولسه ما اتختارش مقاس: مفيش أزرار سريعة (الرقم الإجمالي مش مخزون المقاس)
  const needVariant = variants.length > 0 && variantId == null
  const quicks = needVariant ? [] : isIn ? [1, 5, 10, 50] : [1, 5, 10].filter((n) => n < stockNow)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[460px]">
        <StockHero
          tone={tone}
          icon={isDamage ? AlertTriangle : isIn ? ArrowDownToLine : ArrowUpFromLine}
          title={title}
          subtitle={product.name}
        />
        <DialogBody className="space-y-4">
          {/* بطاقة المنتج: الحالي ← بعد الحركة */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{product.name}</p>
              {product.barcode && (
                <p className="font-mono text-[11px] text-foreground/60" dir="ltr">{product.barcode}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-center tabular-nums">
              <div>
                <p className="text-[10px] font-bold text-foreground/55">الحالية</p>
                <p className="text-lg font-extrabold">{stockNow}</p>
              </div>
              <span className="text-foreground/40">←</span>
              <div>
                <p className="text-[10px] font-bold text-foreground/55">بعد الحركة</p>
                <p className={cn('text-lg font-extrabold', qNum > 0 ? (over ? 'text-destructive' : t.text) : 'text-foreground/35')}>
                  {qNum > 0 ? after : '—'}
                </p>
              </div>
            </div>
          </div>

          {isDamage && (
            <div className="rounded-2xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
              تسجيل الهالك هيخصم الكمية من المخزون <b>وهيسجّل الخسارة تلقائياً</b> في
              المصروفات (فئة «هالك وتالف») بقيمة <b>الكمية × التكلفة الحالية</b> — فتظهر
              في صافي الربح. الخزنة مش هتتأثر (مفيش فلوس خرجت).
            </div>
          )}

          {variants.length > 0 && (
            <section>
              <SecLabel required>اللون / المقاس</SecLabel>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {variants.map((v) => (
                  <Pill key={v.id} tone={tone} active={variantId === v.id} onClick={() => setVariantId(v.id)}>
                    {[v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`} · {v.quantity}
                  </Pill>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-foreground/60">
                المنتج ده له ألوان ومقاسات — الحركة بتتسجل على اللون/المقاس المختار، وكمية المنتج بتتحسب من مجموعهم.
              </p>
            </section>
          )}

          {!isDamage && (
            <div className="rounded-2xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
              {isIn
                ? 'الحركة دي بتغيّر الكمية بس (تسوية). بضاعة جاية من مورد؟ لازم تتسجل كأمر شراء عشان الدين والتكلفة والخزنة تتحدّث.'
                : 'الحركة دي بتخصم الكمية بس. إرجاع بضاعة لمورد؟ استخدم «المشتريات ← مرتجع» عشان حساب المورد يتحدّث.'}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => goPurchases(product, isIn ? 'buy' : 'return')}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
                >
                  {isIn ? 'سجّلها كأمر شراء' : 'ابحث عن أمر الشراء (مرتجع مورد)'}
                </button>
              </div>
            </div>
          )}
          {!isAdminUser && !isDamage && (
            <p className="text-[11px] font-medium text-foreground/60">
              الحد المسموح للموظف: {STOCK_POLICY.employeeMaxQty} قطع أو {STOCK_POLICY.employeeMaxValue} جنيه للحركة الواحدة — فوق كده محتاج المدير. وحركاتك بتظهر للمدير للمراجعة.
            </p>
          )}

          <section>
            <SecLabel required>الكمية {isDamage ? 'التالفة' : isIn ? 'الواردة' : 'الخارجة'}</SecLabel>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="إنقاص"
                onClick={() => setQty(String(Math.max(0, qNum - 1) || ''))}
                className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background hover:bg-muted', STOCK_RING)}
              >
                <Minus className="size-4" />
              </button>
              <input
                dir="ltr"
                type="number"
                min={1}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
                placeholder="0"
                className={cn(STOCK_FIELD, 'h-12 min-w-0 flex-1 text-center text-xl font-extrabold tabular-nums', over && 'border-destructive focus:border-destructive focus:ring-destructive/15')}
              />
              <button
                type="button"
                aria-label="زيادة"
                onClick={() => setQty(String(qNum + 1))}
                className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background hover:bg-muted', STOCK_RING)}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {quicks.map((n) => (
                <Pill key={n} tone={tone} active={qNum === n} onClick={() => setQty(String(n))}>
                  {n}
                </Pill>
              ))}
              {!isIn && stockNow > 0 && !needVariant && (
                <Pill tone={tone} active={qNum === stockNow} onClick={() => setQty(String(stockNow))}>
                  الكل ({stockNow})
                </Pill>
              )}
            </div>
            {over && (
              <p className="mt-1.5 text-[11px] font-bold text-destructive">
                الكمية أكبر من المتاح ({stockNow})
              </p>
            )}
            {lossPreview > 0 && (
              <p className="mt-1.5 text-xs font-medium text-foreground/70">
                قيمة الخسارة المتوقعة: <b className="text-destructive">{formatCurrency(lossPreview)}</b>
              </p>
            )}
          </section>

          <section>
            <SecLabel required={!isIn}>السبب</SecLabel>
            {type === 'out' && (
              <p className="mb-1.5 text-[11px] font-medium text-foreground/60">
                بضاعة تالفة أو منتهية؟ سجّلها من زر ⚠ «هالك» عشان الخسارة تتحسب في المصروفات والأرباح.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <Pill key={r} tone={tone} active={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Pill>
              ))}
            </div>
          </section>

          <section>
            <SecLabel>ملاحظة إضافية</SecLabel>
            <Textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="اختياري..."
              className="rounded-xl"
            />
          </section>
        </DialogBody>
        <DialogFooter className="flex-row gap-2 border-t px-4 py-3 sm:px-6">
          <Button
            onClick={submit}
            disabled={saving}
            className={cn('h-11 flex-1 rounded-xl font-extrabold', t.btn)}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isDamage ? 'تأكيد تسجيل الهالك' : isIn ? 'تأكيد الإضافة' : 'تأكيد الخصم'}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Exchange with supplier (استبدال مورد) ---------------- */

interface ExchangeLineUI {
  productId: number
  name: string
  cost: number
  quantity: string
  /** 🎨 2026-10-19: لون/مقاس محدد للمنتجات ذات الشبكة — null للمنتجات البسيطة.
   * الكمية بتدخل على المقاس نفسه في المخزون (كمية المنتج = مجموع مقاساته) */
  variantId?: number | null
  variantLabel?: string | null
}

/** بحث صنف + إضافته (بدل القائمة الطويلة) */
function ProductSearchPick({
  items,
  placeholder,
  onPick,
  showStock,
}: {
  items: InventoryProduct[]
  placeholder: string
  onPick: (id: number) => void
  showStock?: boolean
}) {
  const [q, setQ] = React.useState('')
  const s = q.trim().toLowerCase()
  const results = React.useMemo(
    () =>
      s
        ? items
            .filter((p) => p.name.toLowerCase().includes(s) || (p.barcode || '').toLowerCase().includes(s))
            .slice(0, 20)
        : [],
    [items, s]
  )
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className={cn(STOCK_FIELD, 'ps-9')}
        />
      </div>
      {s && (
        <ul className="max-h-44 overflow-y-auto overscroll-contain rounded-xl border bg-popover">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">مفيش نتائج</li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.id)
                    setQ('')
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
                >
                  <span className="truncate font-bold">{p.name}</span>
                  {showStock && <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground/60">متاح {p.quantity}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function ExchangeDialog({
  open,
  onOpenChange,
  products,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  products: InventoryProduct[]
  branches: Branch[]
  onDone: () => void
}) {
  const available = React.useMemo(() => products.filter(p => p.quantity > 0), [products])
  const [supplierId, setSupplierId] = React.useState('')
  const [suppliers, setSuppliers] = React.useState<Array<{ id: number; name: string }>>([])
  const [outLines, setOutLines] = React.useState<ExchangeLineUI[]>([])
  const [inLines, setInLines] = React.useState<ExchangeLineUI[]>([])
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  // 🎨 2026-10-19: شبكة الألوان×المقاسات للمنتجات ذات المقاسات — نفس نمط أمر الشراء:
  // الكمية بتتسجل على كل لون/مقاس لوحده عشان كمية المنتج (= مجموع مقاساته) ما تتمسحش
  const [matrix, setMatrix] = React.useState<{
    kind: 'out' | 'in'
    product: InventoryProduct
    variants: PurchaseVariantLite[]
  } | null>(null)

  React.useEffect(() => {
    if (open) {
      setOutLines([])
      setInLines([])
      setReason('')
      setSupplierId('')
      setMatrix(null)
      api<Array<{ id: number; name: string }>>('/api/suppliers')
        .then((rows) => setSuppliers(rows.map((r) => ({ id: r.id, name: r.name }))))
        .catch(() => setSuppliers([]))
    }
  }, [open])

  const productById = React.useMemo(() => new Map(products.map(p => [p.id, p])), [products])

  /** اختيار صنف: منتج له ألوان/مقاسات → شبكة كميات، منتج بسيط → سطر مباشر */
  const pickProduct = async (kind: 'out' | 'in', pid: number) => {
    const p = productById.get(pid)
    if (!p) return
    try {
      const variants = await api<PurchaseVariantLite[]>(`/api/products/${p.id}/variants`)
      if (variants.length > 0) {
        setMatrix({ kind, product: p, variants })
        return
      }
    } catch {
      /* فشل الجلب: نكمل كمنتج بسيط والسيرفر حاجز أي حال */
    }
    const setter = kind === 'out' ? setOutLines : setInLines
    const lines = kind === 'out' ? outLines : inLines
    if (lines.some(l => l.productId === p.id && l.variantId == null)) {
      toast.error('الصنف مضاف بالفعل — عدّل الكمية')
      return
    }
    setter([...lines, { productId: p.id, name: p.name, cost: p.cost ?? 0, quantity: '1', variantId: null, variantLabel: null }])
  }

  /** كميات الشبكة الحالية لنفس المنتج (للتعديل) */
  const matrixInitialQty = React.useMemo((): Record<number, number> => {
    if (!matrix) return {}
    const lines = matrix.kind === 'out' ? outLines : inLines
    const out: Record<number, number> = {}
    for (const l of lines) {
      if (l.productId === matrix.product.id && l.variantId != null) {
        out[l.variantId] = parseInt(l.quantity, 10) || 0
      }
    }
    return out
  }, [matrix, outLines, inLines])

  /** تأكيد الشبكة: سطور المنتج دي بتتشال وتتحل بأرقام المقاسات الجديدة */
  const confirmMatrix = (r: PurchaseVariantsResult) => {
    if (!matrix) return
    const setter = matrix.kind === 'out' ? setOutLines : setInLines
    const lines = matrix.kind === 'out' ? outLines : inLines
    const others = lines.filter(l => l.productId !== matrix.product.id)
    const newLines: ExchangeLineUI[] = Object.entries(r.qty).map(([vid, qty]) => {
      const v = matrix.variants.find(x => x.id === Number(vid))
      return {
        productId: matrix.product.id,
        name: matrix.product.name,
        cost: matrix.product.cost ?? 0,
        quantity: String(qty),
        variantId: Number(vid),
        variantLabel: [v?.color, v?.size].filter(Boolean).join(' / ') || null,
      }
    })
    setter([...others, ...newLines])
    setMatrix(null)
  }

  const valueOf = (lines: ExchangeLineUI[]) =>
    lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0) * Math.max(0, l.cost), 0)
  const valueOut = valueOf(outLines)
  const valueIn = valueOf(inLines)
  const diff = Math.round((valueIn - valueOut) * 100) / 100

  const submit = async () => {
    const out = outLines
      .map(l => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter(l => l.quantity > 0)
    const inn = inLines
      .map(l => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter(l => l.quantity > 0)
    if (!supplierId) { toast.error('اختار المورد'); return }
    if (out.length === 0 || inn.length === 0) {
      toast.error('لازم بضاعة راجعة وبضاعة بديلة (صنف على الأقل في كل جانب)')
      return
    }
    if (reason.trim().length < 3) { toast.error('اكتب سبب الاستبدال (إجباري)'); return }
    setSaving(true)
    try {
      const res = await api<{ message?: string }>('/api/inventory/exchange', {
        method: 'POST',
        body: { supplierId: parseInt(supplierId, 10), lines: out, replacements: inn, note: reason.trim() },
      })
      toast.success(res?.message || 'تم تسجيل الاستبدال')
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الاستبدال')
    } finally {
      setSaving(false)
    }
  }

  const lineEditor = (
    lines: ExchangeLineUI[],
    setter: React.Dispatch<React.SetStateAction<ExchangeLineUI[]>>,
    kind: 'out' | 'in',
  ) => (
    <div className="space-y-2">
      <ProductSearchPick
        items={kind === 'out' ? available : products}
        placeholder={kind === 'out' ? 'ابحث عن صنف راجع للمورد…' : 'ابحث عن صنف بديل من المورد…'}
        showStock={kind === 'out'}
        onPick={(id) => { void pickProduct(kind, id) }}
      />
      {lines.length > 0 && (
        <div className={cn('space-y-1.5', lines.length > 3 && 'max-h-48 overflow-y-auto overscroll-contain pe-1')}>
          {lines.map((l, idx) => {
            const avail = kind === 'out' && l.variantId == null ? productById.get(l.productId)?.quantity ?? 0 : null
            const over = avail !== null && (parseInt(l.quantity, 10) || 0) > avail
            return (
              <div key={`${l.productId}-${l.variantId ?? 0}`} className="flex items-center gap-2 rounded-xl border bg-background p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {l.name}
                    {l.variantLabel && <span className="font-semibold text-foreground/60"> — {l.variantLabel}</span>}
                  </p>
                  <p className={cn('text-[11px] font-medium', over ? 'text-destructive' : 'text-foreground/60')}>
                    {over ? `أكبر من المتاح (${avail})` : `تكلفة الوحدة: ${formatCurrency(l.cost)}`}
                  </p>
                </div>
                <input
                  dir="ltr"
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => {
                    const v = e.target.value
                    setter(lines.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))
                  }}
                  className={cn(STOCK_FIELD, 'h-9 w-16 px-1 text-center font-bold tabular-nums', over && 'border-destructive')}
                />
                <button
                  type="button"
                  aria-label="حذف"
                  onClick={() => setter(lines.filter((_, i) => i !== idx))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <StockHero
          tone="swap"
          icon={Repeat}
          title="استبدال بضاعة مع مورد"
          subtitle="تالف/مردود يرجع للمورد وبديل تاخده — فرق القيمة على حساب المورد"
        />
        <DialogBody className="space-y-4">
          <section>
            <SecLabel required>المورد</SecLabel>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="اختر المورد..." /></SelectTrigger>
              <SelectContent>
                {suppliers.map(su => (
                  <SelectItem key={su.id} value={String(su.id)}>{su.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-3">
            <SecLabel aside={<span className="text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300">{formatCurrency(valueOut)}</span>}>
              <span className="me-1.5 inline-flex size-5 items-center justify-center rounded-full bg-rose-700 text-[11px] text-white">١</span>
              بضاعة راجعة للمورد
            </SecLabel>
            {lineEditor(outLines, setOutLines, 'out')}
          </section>

          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
            <SecLabel aside={<span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatCurrency(valueIn)}</span>}>
              <span className="me-1.5 inline-flex size-5 items-center justify-center rounded-full bg-emerald-700 text-[11px] text-white">٢</span>
              بضاعة بديلة من المورد
            </SecLabel>
            {lineEditor(inLines, setInLines, 'in')}
          </section>

          <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
            <span className="text-foreground/65">فرق القيمة </span>
            <b className="tabular-nums">{formatCurrency(Math.abs(diff))}</b>{' '}
            {diff === 0 ? (
              <span className="text-xs font-medium text-muted-foreground">— استبدال متكافئ (مفيش أثر على حساب المورد)</span>
            ) : diff > 0 ? (
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">— هتزيد عليك في الحساب</span>
            ) : (
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">— هتقل حسابك عنده</span>
            )}
          </div>

          <section>
            <SecLabel required>سبب الاستبدال</SecLabel>
            <Textarea
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: 3 قطع تالفة بديلها قطع سليمة..."
              className="rounded-xl"
            />
          </section>
        </DialogBody>
        <DialogFooter className="flex-row gap-2 border-t px-4 py-3 sm:px-6">
          <Button onClick={submit} disabled={saving} className={cn('h-11 flex-1 rounded-xl font-extrabold', TONE.swap.btn)}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            تأكيد الاستبدال
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>

      {/* 🎨 2026-10-19: شبكة الألوان×المقاسات — للخروج محدودة بمخزون كل مقاس، وللوارد حرة */}
      <PurchaseVariantsDialog
        open={matrix !== null}
        onOpenChange={(o) => { if (!o) setMatrix(null) }}
        productName={matrix?.product.name ?? ''}
        variants={matrix?.variants ?? []}
        initialQty={matrixInitialQty}
        initialCost={0}
        onConfirm={confirmMatrix}
        showCost={false}
        maxByStock={matrix?.kind === 'out'}
        title={matrix?.kind === 'out' ? 'الكمية الراجعة للمورد لكل لون ومقاس' : 'كمية البديل لكل لون ومقاس'}
        confirmLabel={matrix?.kind === 'out' ? 'أضف للبضاعة الراجعة' : 'أضف للبضاعة البديلة'}
        emptyHint="اكتب الكمية في الألوان/المقاسات المطلوبة"
        stockLabel={matrix?.kind === 'out' ? 'متاح' : 'مخزون'}
      />
    </Dialog>
  )
}
