'use client'

import * as React from 'react'
import {
  ScanLine,
  Trash2,
  Loader2,
  CheckCircle2,
  Save,
  ClipboardList,
  Building2,
  User,
  Check,
  AlertCircle,
  CornerDownLeft,
  PackageOpen,
  Hash,
  Scale,
  ArrowLeftRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import type { Branch, InventoryProduct, Stocktake } from '../InventoryView'
import {
  ACCENT,
  Signed,
  EmptyState,
  QtyStepper,
  Segmented,
  fullDateLabel,
  num,
  shortDateLabel,
  timeLabel,
} from './shared'

interface Props {
  stocktakes: Stocktake[]
  branches: Branch[]
  products: InventoryProduct[]
  userBranchId: number | null
  onChanged: () => void
}

const VIOLET = ACCENT.stocktake
const GREEN = '#10b981'
const AMBER = '#f59e0b'
const ROSE = '#f43f5e'

const diffColor = (d: number) => (d === 0 ? VIOLET : d > 0 ? GREEN : ROSE)
const pad3 = (n: number) => String(n).padStart(3, '0')
/** ختم الحالة */
function Stamp({ status, rot = -8 }: { status: string; rot?: number }) {
  const committed = status === 'committed'
  const color = committed ? GREEN : AMBER
  return (
    <span
      className="inv-stamp inline-block rounded-md border-[2.5px] px-2.5 py-0.5 text-xs font-black tracking-wider"
      style={{
        color,
        borderColor: color,
        borderStyle: committed ? 'double' : 'dashed',
        ['--r' as string]: `${rot}deg`,
      }}
    >
      {committed ? 'معتمد' : 'مسودة'}
    </span>
  )
}

/** حلقة المطابقة — فاتحة ومعبّرة بهوية الجرد البنفسجية */
function MatchRing({ value, total }: { value: number; total: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  const pct = total ? value / total : 0
  return (
    <div className="relative size-[8rem] shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--stocktake-soft)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={pct === 1 ? GREEN : VIOLET}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1), stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-black leading-none tabular-nums text-foreground">
          {Math.round(pct * 100)}
          <span className="text-base text-muted-foreground">%</span>
        </span>
        <span className="mt-1 text-xs font-medium text-muted-foreground">مطابقة</span>
      </div>
    </div>
  )
}

// حقول محطة الجرد بهوية تركواز واضحة
const unitField =
  'border-stocktake/25 bg-card text-foreground placeholder:text-muted-foreground/70 focus-visible:border-stocktake focus-visible:ring-stocktake/20'

export function StocktakeTab({ stocktakes, branches, products, userBranchId, onChanged }: Props) {
  // 🛡️ 2026-09-14: branchId, items, note live in the Zustand store with
  // localStorage persistence — so a draft stays alive across tab switches,
  // page refreshes, and even navigation to other pages. The `scan` input
  // stays as local state (it's transient typing, not worth persisting).
  const stocktakeDraft = useShopStore((s) => s.stocktakeDraft)
  const setStocktakeDraft = useShopStore((s) => s.setStocktakeDraft)
  const clearStocktakeDraft = useShopStore((s) => s.clearStocktakeDraft)

  const branchId = stocktakeDraft.branchId
  const items = stocktakeDraft.items
  const note = stocktakeDraft.note

  const setBranchId = (v: string) => setStocktakeDraft({ branchId: v })
  const setItems = (updater: (prev: typeof items) => typeof items) =>
    setStocktakeDraft({ items: updater(items) })
  const setNote = (v: string) => setStocktakeDraft({ note: v })

  const [scan, setScan] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [viewing, setViewing] = React.useState<Stocktake | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'draft' | 'committed'>('all')
  const [view, setView] = React.useState<'all' | 'diff' | 'match'>('all')
  const [last, setLast] = React.useState<{ name: string; qty: number; n: number } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const effectiveBranchId = branchId || (branches.length > 0 ? String(branches[0].id) : '')

  // 🛡️ 2026-09-14: pre-fill the branchId in the draft for branch-locked employees.
  React.useEffect(() => {
    if (!branchId && userBranchId) {
      setBranchId(String(userBranchId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBranchId, branchId])

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [effectiveBranchId, items.length])

  const scopedProducts = React.useMemo(() => {
    if (!effectiveBranchId) return products
    return products.filter((p) => p.branchId === parseInt(effectiveBranchId, 10) || p.branchId == null)
  }, [products, effectiveBranchId])

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault()
    const q = scan.trim()
    if (!q) return
    let p = scopedProducts.find((x) => x.barcode && x.barcode === q)
    if (!p) p = scopedProducts.find((x) => x.name.toLowerCase() === q.toLowerCase())
    if (!p) p = scopedProducts.find((x) => x.name.toLowerCase().includes(q.toLowerCase()))
    if (!p) {
      toast.error(`لم يتم العثور على المنتج: ${q}`, { id: 'not-found' })
      setScan('')
      inputRef.current?.focus()
      return
    }
    const existing = items.find((i) => i.productId === p!.id)
    // 🥬 2026-10-12: منتج الوزن — الخطوة 0.5 كيلو (القيمة المكتوبة بتقبل كسور)
    const inc = p!.soldByWeight ? 0.5 : 1
    const newQty = existing ? Math.round((existing.countedQty + inc) * 1000) / 1000 : inc
    setItems((prev) => {
      const exists = prev.find((i) => i.productId === p!.id)
      if (exists) {
        return prev.map((i) => (i.productId === p!.id ? { ...i, countedQty: Math.round((i.countedQty + inc) * 1000) / 1000 } : i))
      }
      return [
        ...prev,
        { productId: p!.id, name: p!.name, barcode: p!.barcode, systemQty: p!.quantity, countedQty: inc, soldByWeight: p!.soldByWeight === true },
      ]
    })
    setLast((l) => ({ name: p!.name, qty: newQty, n: (l?.n ?? 0) + 1 }))
    setScan('')
    inputRef.current?.focus()
  }

  const setCounted = (productId: number, qty: number) => {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, countedQty: Math.max(0, qty) } : i)))
  }
  const removeItem = (productId: number) => setItems((prev) => prev.filter((i) => i.productId !== productId))

  const resetForm = () => {
    clearStocktakeDraft()
    setScan('')
    setLast(null)
    inputRef.current?.focus()
  }

  const submit = async (commit: boolean) => {
    if (items.length === 0) { toast.error('أضف أصنافاً للجرد'); return }
    setSaving(true)
    try {
      await api('/api/inventory/stocktake', {
        method: 'POST',
        body: {
          branchId: effectiveBranchId ? parseInt(effectiveBranchId, 10) : null,
          items: items.map((i) => ({ productId: i.productId, systemQty: i.systemQty, countedQty: i.countedQty })),
          note: note.trim() || null,
          commit,
        },
      })
      toast.success(commit ? 'تم اعتماد الجرد وتسوية الكميات' : 'تم حفظ الجرد كمسودة')
      resetForm()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const totalDiff = items.reduce((s, i) => s + (i.countedQty - i.systemQty), 0)
  const matchedCount = items.filter((i) => i.countedQty === i.systemQty).length
  const diffCount = items.length - matchedCount

  // الأحدث أولاً
  const shown = React.useMemo(() => {
    const list = [...items].reverse()
    if (view === 'diff') return list.filter((i) => i.countedQty !== i.systemQty)
    if (view === 'match') return list.filter((i) => i.countedQty === i.systemQty)
    return list
  }, [items, view])

  const counts = React.useMemo(() => ({
    all: stocktakes.length,
    draft: stocktakes.filter((s) => s.status === 'draft').length,
    committed: stocktakes.filter((s) => s.status === 'committed').length,
  }), [stocktakes])
  const visible = React.useMemo(
    () => (statusFilter === 'all' ? stocktakes : stocktakes.filter((s) => s.status === statusFilter)),
    [stocktakes, statusFilter],
  )

  return (
    <div className="space-y-6">
      {/* ═════════ وحدة المسح ═════════ */}
      <section className="animate-in-up overflow-hidden rounded-2xl border border-stocktake/20 bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-stocktake text-stocktake-foreground shadow-sm">
                <ScanLine className="size-[22px]" />
              </span>
              <div>
                <h2 className="text-xl font-black leading-tight">مسح وإضافة صنف</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="inv-blink size-2 rounded-full bg-stocktake" />
                  جاهز للمسح — كل قراءة تزيد العدد الفعلي واحدًا
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {!userBranchId ? (
                <Select value={effectiveBranchId} onValueChange={setBranchId}>
                  <SelectTrigger className={cn('h-11 w-full', unitField)} aria-label="الفرع">
                    <span className="flex items-center gap-2">
                      <Building2 className="size-4 text-stocktake" />
                      <SelectValue placeholder="اختر الفرع" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.isMain && ' ★'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className={cn('flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium', unitField)}>
                  <Building2 className="size-4 text-stocktake" />
                  {branches.find((b) => b.id === userBranchId)?.name ?? '—'}
                </div>
              )}
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظة الجرد (مثال: جرد شهري)"
                className={cn('h-11', unitField)}
              />
            </div>

            <form onSubmit={handleScan} className="relative overflow-hidden rounded-xl border-2 border-stocktake bg-stocktake-soft p-1.5 ring-4 ring-stocktake/10">
              <span aria-hidden className="inv-laser pointer-events-none absolute inset-y-1.5 w-0.5 rounded-full bg-stocktake-warm shadow-[0_0_12px_3px_color-mix(in_oklab,var(--stocktake-warm)_45%,transparent)]" />
              <div className="relative flex items-center gap-2">
                <ScanLine className="ms-3 size-6 shrink-0 text-stocktake" />
                <input
                  ref={inputRef}
                  autoFocus
                  dir="ltr"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  placeholder="امسح الباركود أو اكتب اسم الصنف"
                  style={{ outline: 'none', boxShadow: 'none', border: 0 }}
                  /* 📱 2026-10-07: w-0 مع flex-1 — الحجم الجوهري للـ input (~216px)
                      كان بيكبّر min-content بتاع الشبكة فيخلي الكارت أعرض من شاشة
                      الجوال ويتقص. w-0 بيخليه ينضغط صح جوه الصف. */
                  className="h-12 w-0 min-w-0 flex-1 bg-transparent font-mono text-lg text-foreground placeholder:font-sans placeholder:text-muted-foreground/70"
                />
                <Button type="submit" disabled={!scan.trim()} className="h-11 shrink-0 rounded-lg bg-stocktake px-5 text-stocktake-foreground hover:bg-stocktake-strong">
                  <CornerDownLeft className="size-4" />
                  Enter
                </Button>
              </div>
            </form>

            {/* آخر صنف */}
            <div className="min-h-[3.5rem]">
              {last ? (
                <div key={last.n} className="inv-pop flex items-center gap-3 rounded-xl border border-stocktake/25 bg-stocktake-soft px-3 py-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-stocktake/15 text-stocktake">
                    <Check className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">آخر صنف تم مسحه</p>
                    <p className="text-[15px] font-bold leading-snug [overflow-wrap:anywhere]">{last.name}</p>
                  </div>
                  <span className="font-mono text-3xl font-black tabular-nums text-stocktake">×{last.qty}</span>
                </div>
              ) : (
                <p className="px-1 pt-2 text-sm text-muted-foreground">لسه ما تمّ مسح أي صنف في الجلسة دي…</p>
              )}
            </div>
          </div>

          {/* العدّادات الرقمية */}
          {/* 📱 2026-10-07: العدّادات على الجوال تتكدس عمودي (الحلقة فوق الأرقام)
              — عرضها الأفقي كان 353px وبيتقص على شاشات 360px */}
          <aside className="flex flex-col items-center justify-center gap-4 border-t border-stocktake/15 bg-stocktake-soft p-5 sm:flex-row sm:gap-5 lg:flex-col lg:gap-6 lg:border-s lg:border-t-0 lg:px-7">
            <MatchRing value={matchedCount} total={items.length} />
            <div className="grid grid-cols-3 gap-5 text-center lg:gap-6">
              <Digit label="معدود" value={pad3(items.length)} className="text-stocktake" />
              <Digit label="مطابق" value={pad3(matchedCount)} className="text-emerald-600 dark:text-emerald-400" />
              <Digit label="فرق" value={pad3(diffCount)} className={diffCount ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} />
            </div>
            <div className="hidden text-center lg:block">
              <p className="text-xs text-muted-foreground">صافي الفرق</p>
              <p dir="ltr" className="font-mono text-2xl font-black tabular-nums">
                <span className={totalDiff === 0 ? 'text-muted-foreground' : totalDiff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  <Signed value={totalDiff} />
                </span>
              </p>
            </div>
          </aside>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stocktake/15 bg-card-muted px-5 py-3.5 sm:px-7">
            <p className="text-sm text-muted-foreground">
              الاعتماد بيعدّل كميات المخزون حسب العدّ الفعلي ·{' '}
              <span dir="ltr" className="font-mono font-bold text-foreground"><Signed value={totalDiff} /></span> وحدة
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={resetForm} disabled={saving} className="text-muted-foreground hover:bg-stocktake/10 hover:text-foreground">
                مسح الكل
              </Button>
              <Button variant="outline" onClick={() => submit(false)} disabled={saving} className="border-stocktake/30 bg-background text-foreground hover:bg-stocktake/10">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ مسودة
              </Button>
              <Button onClick={() => submit(true)} disabled={saving} className="bg-stocktake text-stocktake-foreground hover:bg-stocktake-strong">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                اعتماد وتسوية
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ═════════ كروت العدّ ═════════ */}
      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stocktake/15 pb-3">
            <div>
              <p className="text-xs font-bold text-stocktake">بطاقات الجرد الحالية</p>
              <h3 className="text-lg font-black">الأصناف المعدودة <span className="text-sm font-medium text-muted-foreground">· {items.length}</span></h3>
            </div>
            <Segmented<'all' | 'diff' | 'match'>
              value={view}
              onChange={setView}
              accent={VIOLET}
              options={[
                { value: 'all', label: 'الكل', count: items.length },
                { value: 'diff', label: 'بفرق', count: diffCount, color: AMBER },
                { value: 'match', label: 'مطابق', count: matchedCount, color: GREEN },
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((it) => {
              const diff = it.countedQty - it.systemQty
              const c = diffColor(diff)
              const max = Math.max(it.systemQty, it.countedQty, 1)
              return (
                 <article
                  key={it.productId}
                   className="group relative overflow-hidden rounded-2xl border border-stocktake/15 bg-card shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-stocktake/35 hover:shadow-md"
                >
                   <div className="flex items-start gap-3 border-b border-stocktake/10 bg-stocktake-soft p-4">
                     <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-stocktake shadow-xs ring-1 ring-stocktake/15">
                       <PackageOpen className="size-5" />
                     </span>
                    <div className="min-w-0 flex-1">
                       <div className="mb-1 flex items-center gap-2">
                         <span className="rounded-md bg-stocktake px-1.5 py-0.5 text-[10px] font-extrabold text-stocktake-foreground">بطاقة صنف</span>
                         <span className="font-mono text-[10px] font-bold text-muted-foreground">#{String(it.productId).padStart(4, '0')}</span>
                       </div>
                       <h4 className="text-base font-black leading-snug [overflow-wrap:anywhere]">{it.name}</h4>
                       <p dir="ltr" className="mt-1 flex items-center gap-1 text-start font-mono text-xs text-muted-foreground"><Hash className="size-3 shrink-0" />{it.barcode || 'بدون باركود'}</p>
                    </div>
                     <Button
                       type="button" variant="ghost" size="icon"
                      onClick={() => removeItem(it.productId)}
                      title="حذف"
                       className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                     </Button>
                  </div>

                   <div className="p-4">
                     <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                     <div className="rounded-xl border border-border bg-card-muted p-3">
                       <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Scale className="size-3.5" /> رصيد النظام {it.soldByWeight ? '(كجم)' : ''}</p>
                       <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{num(it.systemQty)}</p>
                    </div>
                     <div className="text-center">
                       <p className="mb-1.5 text-xs font-black text-stocktake">{it.soldByWeight ? 'الوزن الفعلي (كجم)' : 'العدد الفعلي'}</p>
                       <QtyStepper value={it.countedQty} min={0} onChange={(v) => setCounted(it.productId, v)} accent={c} decimal={it.soldByWeight} step={it.soldByWeight ? 0.5 : 1} />
                     </div>
                  </div>

                  {/* مقارنة بصرية */}
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-slate-400/60 transition-all" style={{ width: `${(it.systemQty / max) * 100}%` }} />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(it.countedQty / max) * 100}%`, backgroundColor: c }} />
                    </div>
                  </div>

                   <div className="mt-3 flex items-center justify-between border-t border-dashed pt-3">
                     <span className="text-xs font-bold text-muted-foreground">نتيجة المطابقة</span>
                    {diff === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: VIOLET }}>
                        <Check className="size-3.5" /> مطابق
                      </span>
                    ) : (
                      <span dir="ltr" className="rounded-lg px-2.5 py-0.5 font-mono text-sm font-black tabular-nums" style={{ backgroundColor: `${c}1f`, color: c }}>
                        <Signed value={diff} />
                      </span>
                    )}
                   </div>
                   </div>
                </article>
              )
            })}
          </div>
          {shown.length === 0 && (
            <p className="rounded-2xl border border-dashed py-8 text-center text-sm text-muted-foreground">مفيش أصناف في العرض ده</p>
          )}
        </section>
      )}

      {/* ═════════ أرشيف أوراق الجرد ═════════ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-stocktake/15 text-stocktake">
              <ClipboardList className="size-4" />
            </span>
            أرشيف الجرد
          </h2>
          <Segmented<'all' | 'draft' | 'committed'>
            value={statusFilter}
            onChange={setStatusFilter}
            accent={VIOLET}
            options={[
              { value: 'all', label: 'الكل', count: counts.all },
              { value: 'draft', label: 'مسودة', count: counts.draft, color: AMBER },
              { value: 'committed', label: 'معتمد', count: counts.committed, color: GREEN },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            accent={VIOLET}
            title={stocktakes.length === 0 ? 'الأرشيف فاضي' : 'مفيش أوراق بالحالة دي'}
            hint={stocktakes.length === 0 ? 'ابدأ أول جرد من وحدة المسح فوق' : 'جرّب حالة تانية'}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((st, i) => {
              const totalD = st.items.reduce((s, x) => s + x.diff, 0)
              const matched = st.items.filter((x) => x.diff === 0).length
              const pct = st.items.length ? (matched / st.items.length) * 100 : 0
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setViewing(st)}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-start transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* خطوط ورقة */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.5]"
                    style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 27px, rgba(128,128,128,0.06) 27px 28px)' }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-muted-foreground">ورقة جرد #{String(st.id).padStart(4, '0')}</p>
                        <h4 className="mt-0.5 truncate text-[15px] font-extrabold">{st.branch?.name ?? 'كل الفروع'}</h4>
                      </div>
                      <Stamp status={st.status} rot={i % 2 ? 7 : -8} />
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">صافي الفرق</p>
                        <p dir="ltr" className="text-start font-mono text-3xl font-black tabular-nums">
                          <span style={{ color: totalD === 0 ? undefined : diffColor(totalD) }}>
                            <Signed value={totalD} />
                          </span>
                        </p>
                      </div>
                      <div className="text-end text-xs text-muted-foreground">
                        <p><b className="tabular-nums text-foreground">{st.items.length}</b> صنف</p>
                        <p className="tabular-nums">{shortDateLabel(st.createdAt)} · {timeLabel(st.createdAt)}</p>
                      </div>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-400/40">
                      <div className="h-full rounded-full bg-stocktake" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{matched} مطابق · {st.items.length - matched} بفرق</span>
                      {st.createdByName && (
                        <span className="flex items-center gap-1"><User className="size-3" />{st.createdByName}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {viewing && (
        <StocktakeDetailDialog
          stocktake={viewing}
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          onCommit={async () => {
            setSaving(true)
            try {
              await api(`/api/inventory/stocktake/${viewing.id}`, { method: 'POST' })
              toast.success('تم اعتماد الجرد')
              setViewing(null)
              onChanged()
            } catch (e: any) {
              toast.error(e?.message || 'فشل')
            } finally {
              setSaving(false)
            }
          }}
          saving={saving}
        />
      )}
    </div>
  )
}

function Digit({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className={cn('font-mono text-3xl font-black leading-none tabular-nums tracking-wider', className)}>
        {value}
      </p>
      <p className="mt-1.5 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

/* ───────────── تفاصيل ورقة الجرد ─────────────
   🎨 إعادة تصميم كاملة بهوية محطة الجرد (تركواز + مرجاني):
   هيرو تركواز غامق بشريط مرجاني (نفس بصمة هيرو الصفحة) → شريط ملخص
   bg-stocktake-soft (نفس بصمة العدّادات الجانبية) → بنود على ورق مسطّر
   (نفس بصمة كروت الأرشيف) → فوتر بهوية الصفحة بدل الزر العام. */

function StocktakeDetailDialog({
  stocktake, open, onOpenChange, onCommit, saving,
}: {
  stocktake: Stocktake
  open: boolean
  onOpenChange: (o: boolean) => void
  onCommit: () => void
  saving: boolean
}) {
  const totalD = stocktake.items.reduce((s, i) => s + i.diff, 0)
  const diffItems = stocktake.items.filter((i) => i.diff !== 0).length
  const isDraft = stocktake.status === 'draft'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        {/* ─── هيرو الورقة: تركواز المحطة + الشريط المرجاني ─── */}
        <div className="relative bg-stocktake text-stocktake-foreground">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1.5 bg-stocktake-warm" />
          <DialogHeader className="relative gap-0 p-5 pb-4 sm:px-6">
            <DialogTitle className="flex items-start justify-between gap-3 text-start text-stocktake-foreground">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-stocktake-foreground/12 ring-1 ring-stocktake-foreground/20">
                  <ClipboardList className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold tracking-wide text-stocktake-foreground/70">
                    ورقة جرد #{String(stocktake.id).padStart(4, '0')}
                  </span>
                  <span className="mt-0.5 block truncate text-xl font-black leading-tight">
                    {stocktake.branch?.name ?? 'كل الفروع'}
                  </span>
                </span>
              </span>
              <Stamp status={stocktake.status} rot={-6} />
            </DialogTitle>
            <DialogDescription className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-stocktake-foreground/75">
              <span>{fullDateLabel(stocktake.committedAt ?? stocktake.createdAt)}</span>
              {stocktake.note && (
                <span className="rounded-md bg-stocktake-foreground/12 px-2 py-0.5 text-xs font-bold text-stocktake-foreground">
                  {stocktake.note}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ─── شريط الملخص: نفس بصمة عدّادات المحطة (bg-stocktake-soft) ─── */}
        <div className="grid grid-cols-3 border-y border-stocktake/15 bg-stocktake-soft text-center">
          <div className="flex flex-col items-center gap-1 border-e border-stocktake/15 px-3 py-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <PackageOpen className="size-3.5 text-stocktake" />
              الأصناف
            </span>
            <p className="font-mono text-xl font-black tabular-nums text-stocktake">{stocktake.items.length}</p>
          </div>
          <div className="flex flex-col items-center gap-1 border-e border-stocktake/15 px-3 py-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <Scale className="size-3.5 text-stocktake-warm" />
              بفرق
            </span>
            <p className="font-mono text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">{diffItems}</p>
          </div>
          <div className="flex flex-col items-center gap-1 px-3 py-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <ArrowLeftRight className="size-3.5 text-stocktake" />
              صافي الفرق
            </span>
            <p dir="ltr" className="font-mono text-xl font-black tabular-nums">
              <span className={totalD === 0 ? 'text-muted-foreground' : totalD > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                <Signed value={totalD} />
              </span>
            </p>
          </div>
        </div>

        {/* ─── بنود الورقة: ورق مسطّر زي كروت الأرشيف ─── */}
        <div
          className="max-h-[38vh] min-h-[96px] overflow-auto overscroll-contain px-5 py-1 sm:px-6"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 43px, rgba(128,128,128,0.07) 43px 44px)' }}
        >
          {stocktake.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">الورقة دي مفيهاش بنود</p>
          ) : (
            stocktake.items.map((it, idx) => {
              const c = diffColor(it.diff)
              return (
                <div key={idx} className="flex items-center gap-3 border-b border-dashed border-border/70 py-2.5 last:border-b-0">
                  <span className="w-6 shrink-0 font-mono text-xs font-bold text-muted-foreground/70">{String(idx + 1).padStart(2, '0')}</span>
                  <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                  <div className="min-w-0 flex-1">
                    {/* 🛡️ 2026-10-05: بعد الحذف المحاسبي للمنتج بيفضل الربط null —
                        نعرض بديل واضح بدل اسم فاضي، والكميات (systemQty/countedQty) محفوظة. */}
                    <p className="truncate text-sm font-bold text-foreground">
                      {it.product?.name ?? 'منتج محذوف (الكميات محفوظة)'}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      النظام <span className="font-mono font-bold">{num(it.systemQty)}</span>
                      <span className="mx-1 text-muted-foreground/60">←</span>
                      العدّ <span className="font-mono font-black text-foreground">{num(it.countedQty)}</span>
                    </p>
                  </div>
                  {it.diff === 0 ? (
                    <span title="مطابق" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-stocktake/12 text-stocktake">
                      <Check className="size-3.5" />
                    </span>
                  ) : (
                    <span
                      dir="ltr"
                      className="shrink-0 rounded-lg border px-2.5 py-1 font-mono text-sm font-black tabular-nums"
                      style={{ backgroundColor: `${c}1a`, color: c, borderColor: `${c}45` }}
                    >
                      <Signed value={it.diff} />
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ─── الفوتر بهوية المحطة ─── */}
        <DialogFooter className="gap-2 border-t border-stocktake/15 bg-stocktake-soft/60 p-4 sm:px-6">
          {isDraft && (
            <>
              <span className="me-auto hidden items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400 sm:flex">
                <AlertCircle className="size-3.5" />
                الاعتماد هيعدّل كميات المخزون
              </span>
              <Button
                onClick={onCommit}
                disabled={saving}
                className="bg-stocktake text-stocktake-foreground hover:bg-stocktake-strong"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                اعتماد وتسوية
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-stocktake/25 bg-card text-foreground hover:bg-stocktake/10 hover:text-foreground"
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
