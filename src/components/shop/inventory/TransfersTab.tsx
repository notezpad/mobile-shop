'use client'

import * as React from 'react'
import {
  Truck,
  Plus,
  Trash2,
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Bookmark,
  Building2,
  PackagePlus,
  PackageOpen,
  Boxes,
  User,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { useConfirm } from '../ConfirmDialogProvider'
import { ProductPickerCombobox } from '../ProductPickerCombobox'
import { useShopStore } from '@/lib/store'
import type { Branch, InventoryProduct, Transfer } from '../InventoryView'
import {
  ACCENT,
  EmptyState,
  QtyStepper,
  Segmented,
  fullDateLabel,
  num,
  shortDateLabel,
  timeLabel,
} from './shared'

interface Props {
  transfers: Transfer[]
  branches: Branch[]
  products: InventoryProduct[]
  userBranchId: number | null
  onChanged: () => void
}

const AMBER = ACCENT.transfers
const STATUS = {
  pending: { label: 'قيد الشحن', color: '#f59e0b' },
  completed: { label: 'تم التسليم', color: '#10b981' },
  cancelled: { label: 'ملغي', color: '#f43f5e' },
} as const
type StatusKey = keyof typeof STATUS
const statusOf = (s: string) => STATUS[(s as StatusKey)] ?? STATUS.pending

/** شريط تحذير لوجستي */
const HAZARD =
  'repeating-linear-gradient(-45deg, #f59e0b 0 10px, rgba(15,23,42,0.88) 10px 20px)'

/* ───────────── خط المسار المتحرك ───────────── */

function RouteLine({
  color,
  flowing = false,
  dashed = true,
  icon = true,
}: {
  color: string
  flowing?: boolean
  dashed?: boolean
  icon?: boolean
}) {
  // 📱 2026-10-07: overflow-hidden بيفضّي مساهمة min-content للـ svg (w-full)
  // في جريد المسار — من غيرها المسار الأوسط كان بيتضخم لـ 111px على الموبايل
  return (
    <div className="relative flex h-10 min-w-10 items-center overflow-hidden" dir="ltr">
      <svg className="h-2 w-full" preserveAspectRatio="none" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="100%"
          y2="4"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={flowing ? 'inv-dash' : undefined}
          strokeDasharray={flowing ? undefined : dashed ? '6 6' : undefined}
          opacity={flowing || !dashed ? 1 : 0.5}
        />
      </svg>
      {icon && (
        <span
          className="absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card shadow-sm"
          style={{ borderColor: color, color }}
        >
          <Truck className="size-4 -scale-x-100" />
        </span>
      )}
    </div>
  )
}

/* ───────────── عقدة فرع ───────────── */

function BranchNode({
  kind,
  value,
  onChange,
  branches,
  disabled,
  exclude,
}: {
  kind: 'from' | 'to'
  value: string
  onChange?: (v: string) => void
  branches: Branch[]
  disabled?: boolean
  exclude?: string
}) {
  const selected = branches.find((b) => String(b.id) === value)
  return (
    <div
      className={cn(
        // 📱 2026-10-07: min-w-0 — عقدة الفرع لازم تقدر تنكمش تحت min-content
        // عشان اسم الفرع الطويل يلف لسطرين بدل ما يوسّع المسار بره الشاشة
        'relative min-w-0 rounded-2xl border-2 p-3 transition-colors sm:p-4',
        selected ? 'bg-card' : 'border-dashed bg-muted/30',
      )}
      style={selected ? { borderColor: kind === 'from' ? AMBER : '#10b981' } : undefined}
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Building2 className="size-3" />
        {kind === 'from' ? 'نقطة الانطلاق' : 'جهة الوصول'}
      </p>
      {/* 📱 2026-10-07: السطران بدل القص — اسم الفرع الطويل يظهر في سطرين
          على الجوال بدل ما يتقطع بنقاط (line-clamp-1 الافتراضي) */}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-auto w-full border-0 bg-transparent p-0 text-base font-extrabold shadow-none focus:ring-0 focus-visible:ring-0 sm:text-lg dark:bg-transparent [&_[data-slot=select-value]]:line-clamp-2 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:whitespace-normal">
          <SelectValue placeholder={kind === 'from' ? 'اختر المصدر' : 'اختر الوجهة'} />
        </SelectTrigger>
        <SelectContent>
          {branches
            .filter((b) => String(b.id) !== exclude)
            .map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
                {b.isMain && ' ★'}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ═════════════════════════════════════════════ */

export function TransfersTab({ transfers, branches, products, userBranchId, onChanged }: Props) {
  const confirm = useConfirm()
  // 🛡️ 2026-09-14: from, to, items, note, mode live in the Zustand store with
  // localStorage persistence — so a draft transfer stays alive across tab
  // switches, page refreshes, and even navigation to other pages.
  // `pick` stays as local state (transient combobox value).
  const transfersDraft = useShopStore((s) => s.transfersDraft)
  const setTransfersDraft = useShopStore((s) => s.setTransfersDraft)
  const clearTransfersDraft = useShopStore((s) => s.clearTransfersDraft)

  const from = transfersDraft.from
  const to = transfersDraft.to
  const items = transfersDraft.items
  const note = transfersDraft.note
  const mode = transfersDraft.mode

  const setFrom = (v: string) => setTransfersDraft({ from: v })
  const setTo = (v: string) => setTransfersDraft({ to: v })
  const setItems = (updater: (prev: typeof items) => typeof items) =>
    setTransfersDraft({ items: updater(items) })
  const setNote = (v: string) => setTransfersDraft({ note: v })
  const setMode = (v: 'completed' | 'pending') => setTransfersDraft({ mode: v })

  const [pick, setPick] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [viewing, setViewing] = React.useState<Transfer | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<'all' | StatusKey>('all')

  // 🛡️ Pre-fill the source branch from the user's branch if no draft exists
  React.useEffect(() => {
    if (!from && userBranchId) {
      setFrom(String(userBranchId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBranchId, from])

  const eligibleProducts = React.useMemo(() => {
    if (!from) return []
    return products.filter((p) => p.branchId === parseInt(from, 10))
  }, [products, from])

  const addItem = () => {
    if (!pick) return
    const p = eligibleProducts.find((pr) => pr.id === parseInt(pick, 10))
    if (!p) return
    setItems((prev) => {
      const exists = prev.find((i) => i.productId === p.id)
      if (exists) return prev
      // 🥬 2026-10-12: منتج الوزن — التحويل بيبقى بالكيلو (نبدأ بنص كيلو)
      return [
        ...prev,
        { productId: p.id, name: p.name, quantity: p.soldByWeight ? 0.5 : 1, available: p.quantity, soldByWeight: p.soldByWeight === true },
      ]
    })
    setPick('')
  }

  const updateQty = (idx: number, q: number) => {
    setItems((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x
        const item = eligibleProducts.find((p) => p.id === x.productId)
        const max = item?.quantity ?? x.available
        // 🥬 منتج الوزن: أقل كمية 0.05 كيلو
        const minQty = x.soldByWeight ? 0.05 : 1
        return { ...x, quantity: Math.min(Math.max(minQty, Math.round(q * 1000) / 1000), max) }
      }),
    )
  }

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const resetForm = () => {
    clearTransfersDraft()
    setPick('')
    if (userBranchId) setFrom(String(userBranchId))
  }

  const submit = async () => {
    if (!from || !to || from === to) { toast.error('اختر فرعين مختلفين'); return }
    if (items.length === 0) { toast.error('أضف منتجات للتحويل'); return }
    for (const it of items) {
      if (it.quantity <= 0) { toast.error('كمية غير صالحة'); return }
      if (mode === 'completed' && it.quantity > it.available + 1e-9) {
        toast.error(`الكمية أكبر من المتاح (${it.name})`)
        return
      }
    }
    setSaving(true)
    try {
      await api('/api/inventory/transfers', {
        method: 'POST',
        body: {
          fromBranchId: parseInt(from, 10),
          toBranchId: parseInt(to, 10),
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          note: note.trim() || null,
          mode,
        },
      })
      toast.success(mode === 'completed' ? 'تم تنفيذ التحويل' : 'تم حفظ التحويل كمعلّق')
      resetForm()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const commitTransfer = async (t: Transfer) => {
    setSaving(true)
    try {
      await api(`/api/inventory/transfers/${t.id}/commit`, { method: 'POST' })
      toast.success('تم تنفيذ التحويل')
      setViewing(null)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const cancelTransfer = async (t: Transfer) => {
    if (!(await confirm({
      title: `إلغاء التحويل #${t.id}؟`,
      confirmText: 'إلغاء التحويل',
      cancelText: 'تراجع',
    }))) return
    try {
      await api(`/api/inventory/transfers/${t.id}`, { method: 'DELETE' })
      toast.success('تم إلغاء التحويل')
      setViewing(null)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    }
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const routeReady = !!from && !!to && from !== to
  const counts = React.useMemo(() => ({
    all: transfers.length,
    pending: transfers.filter((t) => t.status === 'pending').length,
    completed: transfers.filter((t) => t.status === 'completed').length,
    cancelled: transfers.filter((t) => t.status === 'cancelled').length,
  }), [transfers])
  const visible = React.useMemo(
    () => (statusFilter === 'all' ? transfers : transfers.filter((t) => t.status === statusFilter)),
    [transfers, statusFilter],
  )

  return (
    <div className="space-y-6">
      {/* ═════════ غرفة العمليات: المسار + البوليصة ═════════ */}
      {/* 📱 2026-10-07: grid-cols-1 (minmax(0,1fr)) على الموبايل — من غيرها
          أي min-content جوّه الكروت كان بيكبّر المسار نفسه بره الشاشة */}
      <div className="animate-in-up grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* المسار + إضافة أصناف */}
        <section className="min-w-0 space-y-4">
          <div className="relative overflow-hidden rounded-3xl border bg-card p-4 sm:p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                backgroundImage: 'radial-gradient(rgba(245,158,11,0.22) 1px, transparent 1.2px)',
                backgroundSize: '16px 16px',
                maskImage: 'linear-gradient(to bottom, black, transparent 85%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 85%)',
              }}
            />
            <div className="relative space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Truck className="size-4" />
                </span>
                مسار الشحنة
              </div>

              {/* 📱 2026-10-07: minmax(0,1fr) بدل 1fr — 1fr = minmax(auto,1fr) و
                  auto-min كان بيمنع العمود من النكواش تحت عرض اسم الفرع، فكان
                  الجريد بياخد 401px في شاشة 360px والكارتين يطلعوا بره الموبايل.
                  والمسار الأوسط عرض ثابت صغير على الجوال — 0.8fr كان بياخد ~120px
                  ويضيّق عقدتي الفرع لعمود كلمة-كلمة */}
              <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(2.5rem,0.8fr)_minmax(0,1fr)] sm:gap-3">
                <BranchNode kind="from" value={from} onChange={setFrom} branches={branches} disabled={!!userBranchId} />
                <RouteLine color={routeReady ? AMBER : '#94a3b8'} flowing={routeReady} icon={routeReady} />
                <BranchNode kind="to" value={to} onChange={setTo} branches={branches} exclude={from} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-dashed bg-muted/25 p-4 sm:p-5">
            <p className="mb-2.5 flex items-center gap-2 text-sm font-bold">
              <PackagePlus className="size-4 text-amber-500" />
              حمّل الأصناف على الشحنة
            </p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {/* 🚀 2026-09-13: searchable ProductPickerCombobox (بحث بالاسم أو الباركود) */}
                <ProductPickerCombobox
                  value={pick}
                  onChange={setPick}
                  items={eligibleProducts.map((p) => ({
                    id: p.id,
                    name: p.name,
                    barcode: p.barcode,
                    quantity: p.quantity,
                    category: p.category,
                  }))}
                  placeholder={from ? 'ابحث عن صنف في مخزون المصدر…' : 'اختر نقطة الانطلاق أولاً'}
                  disabled={!from}
                  blockOutOfStock={false}
                />
              </div>
              <Button onClick={addItem} disabled={!pick} className="bg-amber-500 text-white shadow-sm hover:bg-amber-600 disabled:opacity-50">
                <Plus className="size-4" />
                تحميل
              </Button>
            </div>
            {from && (
              <p className="mt-2 text-xs text-muted-foreground">
                {num(eligibleProducts.length)} صنف متاح في مخزون المصدر
              </p>
            )}
          </div>
        </section>

        {/* البوليصة */}
        <section className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="h-2.5 shrink-0" style={{ backgroundImage: HAZARD }} />

          <div className="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Transfer Manifest</p>
              <h2 className="text-lg font-black leading-tight">بوليصة تحويل</h2>
            </div>
            <div className="text-end">
              <p className="font-mono text-2xl font-black leading-none tabular-nums text-amber-600 dark:text-amber-400">
                {String(items.length).padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">صنف · {num(totalQty)} وحدة</p>
            </div>
          </div>

          {/* بنود البوليصة */}
          <div className="min-h-[9rem] flex-1 px-4 sm:px-5">
            {items.length === 0 ? (
              <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center text-muted-foreground">
                <PackageOpen className="size-8 opacity-60" />
                <p className="text-sm">البوليصة فاضية</p>
                <p className="text-sm">حمّل أصناف من الجانب</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-dashed overflow-auto">
                {items.map((it, idx) => {
                  const over = it.quantity > it.available + 1e-9
                  return (
                    <li key={it.productId} className="flex items-center gap-2 py-2.5">
                      <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug [overflow-wrap:anywhere]">{it.name}</p>
                        <p className={cn('text-xs', over ? 'font-bold text-destructive' : 'text-muted-foreground')}>
                          المتاح {num(it.available)}{it.soldByWeight ? ' كجم' : ''}
                        </p>
                      </div>
                      <QtyStepper
                        value={it.quantity}
                        min={it.soldByWeight ? 0.05 : 1}
                        max={it.available}
                        onChange={(v) => updateQty(idx, v)}
                        accent={AMBER}
                        decimal={it.soldByWeight}
                        step={it.soldByWeight ? 0.5 : 1}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        title="إزالة من الشحنة"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* خط التمزيق */}
          <div className="relative my-4">
            <div className="border-t-2 border-dashed" />
            <span className="absolute -start-3 -top-3 size-6 rounded-full border bg-background" />
            <span className="absolute -end-3 -top-3 size-6 rounded-full border bg-background" />
          </div>

          <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع التنفيذ">
              <ModeButton
                active={mode === 'completed'}
                onClick={() => setMode('completed')}
                icon={Zap}
                title="شحن فوري"
                hint="يخصم ويضيف الآن"
                color="#10b981"
              />
              <ModeButton
                active={mode === 'pending'}
                onClick={() => setMode('pending')}
                icon={Bookmark}
                title="حجز معلّق"
                hint="يتنفذ لاحقًا"
                color={AMBER}
              />
            </div>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة على الشحنة (اختياري)…"
              className="resize-none rounded-xl text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm} disabled={saving}>مسح</Button>
              <Button
                size="lg"
                className="flex-1 bg-amber-500 text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                onClick={submit}
                disabled={saving || items.length === 0 || !routeReady}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {mode === 'completed' ? 'اشحن الآن' : 'احجز الشحنة'}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* ═════════ لوحة تتبّع الشحنات ═════════ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Boxes className="size-4" />
            </span>
            تتبّع الشحنات
          </h2>
          <Segmented<'all' | StatusKey>
            value={statusFilter}
            onChange={setStatusFilter}
            accent={AMBER}
            options={[
              { value: 'all', label: 'الكل', count: counts.all },
              { value: 'pending', label: 'قيد الشحن', count: counts.pending, color: STATUS.pending.color },
              { value: 'completed', label: 'تم التسليم', count: counts.completed, color: STATUS.completed.color },
              { value: 'cancelled', label: 'ملغي', count: counts.cancelled, color: STATUS.cancelled.color },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Truck}
            accent={AMBER}
            title={transfers.length === 0 ? 'مفيش شحنات لسه' : 'مفيش شحنات بالحالة دي'}
            hint={transfers.length === 0 ? 'أول تحويل بين الفروع هيظهر هنا ويتتبّع حالته' : 'جرّب حالة تانية'}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <ShipmentCard key={t.id} t={t} onOpen={() => setViewing(t)} />
            ))}
          </div>
        )}
      </section>

      {viewing && (
        <TransferDetailDialog
          transfer={viewing}
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          onCommit={() => commitTransfer(viewing)}
          onCancel={() => cancelTransfer(viewing)}
          saving={saving}
        />
      )}
    </div>
  )
}

/* ───────────── بطاقة شحنة ───────────── */

function ShipmentCard({ t, onOpen }: { t: Transfer; onOpen: () => void }) {
  const st = statusOf(t.status)
  const qty = t.items.reduce((s, i) => s + i.quantity, 0)
  const done = t.status === 'completed'
  const cancelled = t.status === 'cancelled'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-2xl border bg-card text-start transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="h-1.5" style={{ backgroundColor: st.color, opacity: cancelled ? 0.5 : 1 }} />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-muted-foreground">#{String(t.id).padStart(4, '0')}</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ backgroundColor: `${st.color}1f`, color: st.color }}
          >
            {done ? <CheckCircle2 className="size-3" /> : cancelled ? <XCircle className="size-3" /> : <Clock className="size-3" />}
            {st.label}
          </span>
        </div>

        {/* المسار المصغّر */}
        <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-muted-foreground">من</p>
            <p className="text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{t.fromBranch?.name ?? '—'}</p>
          </div>
          <div className="relative flex items-center" dir="ltr">
            <span className="h-0 w-full border-t-2" style={{ borderColor: st.color, borderStyle: done ? 'solid' : 'dashed', opacity: cancelled ? 0.4 : 1 }} />
            <span
              className="absolute left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 bg-card"
              style={{ borderColor: st.color, color: st.color }}
            >
              {done ? <CheckCircle2 className="size-3" /> : cancelled ? <XCircle className="size-3" /> : <ArrowLeft className="size-3" />}
            </span>
          </div>
          <div className="min-w-0 text-end">
            <p className="text-xs font-bold text-muted-foreground">إلى</p>
            <p className="text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{t.toBranch?.name ?? '—'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-dashed pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Boxes className="size-3.5" />
            <b className="tabular-nums text-foreground">{t.items.length}</b> صنف ·{' '}
            <b className="tabular-nums text-foreground">{num(qty)}</b> وحدة
          </span>
          <span className="tabular-nums" title={fullDateLabel(t.completedAt ?? t.createdAt)}>
            {shortDateLabel(t.createdAt)} · {timeLabel(t.createdAt)}
          </span>
        </div>
        {t.createdByName && (
          <p className="-mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3" />
            {t.createdByName}
          </p>
        )}
      </div>
    </button>
  )
}

/* ───────────── زر وضع التنفيذ ───────────── */

function ModeButton({
  active, onClick, icon: Icon, title, hint, color,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
  color: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-start transition-all',
        !active && 'border-transparent bg-muted/60 hover:bg-muted',
      )}
      style={active ? { borderColor: color, backgroundColor: `${color}14` } : undefined}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={active ? { backgroundColor: color, color: '#fff' } : { backgroundColor: `${color}1f`, color }}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold leading-tight">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

/* ───────────── تفاصيل الشحنة ───────────── */

function TransferDetailDialog({
  transfer, open, onOpenChange, onCommit, onCancel, saving,
}: {
  transfer: Transfer
  open: boolean
  onOpenChange: (o: boolean) => void
  onCommit: () => void
  onCancel: () => void
  saving: boolean
}) {
  const st = statusOf(transfer.status)
  const qty = transfer.items.reduce((s, i) => s + i.quantity, 0)
  const done = transfer.status === 'completed'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="overflow-hidden p-0 sm:max-w-[560px]">
        <div className="h-2.5" style={{ backgroundImage: HAZARD }} />
        <div className="space-y-4 p-5 pt-3">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>شحنة #{String(transfer.id).padStart(4, '0')}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: `${st.color}1f`, color: st.color }}
              >
                {st.label}
              </span>
            </DialogTitle>
            <DialogDescription>{fullDateLabel(transfer.completedAt ?? transfer.createdAt)}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-2 rounded-2xl border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">من</p>
              <p className="font-extrabold leading-snug [overflow-wrap:anywhere]">{transfer.fromBranch?.name ?? '—'}</p>
            </div>
            <RouteLine color={st.color} flowing={transfer.status === 'pending'} dashed={!done} icon={false} />
            <div className="min-w-0 text-end">
              <p className="text-xs text-muted-foreground">إلى</p>
              <p className="font-extrabold leading-snug [overflow-wrap:anywhere]">{transfer.toBranch?.name ?? '—'}</p>
            </div>
          </div>

          {transfer.note && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {transfer.note}
            </p>
          )}

          <ul className="max-h-[40vh] divide-y divide-dashed overflow-auto rounded-2xl border px-3">
            {transfer.items.map((it, idx) => (
              <li key={idx} className="flex items-center gap-3 py-2.5">
                <span className="w-5 font-mono text-xs text-muted-foreground">{String(idx + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug [overflow-wrap:anywhere]">{it.product?.name}</p>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">{it.product?.barcode || '—'}</p>
                </div>
                <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 font-mono text-sm font-black tabular-nums text-amber-700 dark:text-amber-400">
                  ×{num(it.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-end text-xs text-muted-foreground">
            الإجمالي <b className="tabular-nums text-foreground">{transfer.items.length}</b> صنف ·{' '}
            <b className="tabular-nums text-foreground">{num(qty)}</b> وحدة
          </p>

          <DialogFooter className="gap-2">
            {transfer.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={saving}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <XCircle className="size-4" />
                  إلغاء الشحنة
                </Button>
                <Button onClick={onCommit} disabled={saving} variant="gradient">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  تأكيد التسليم
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
