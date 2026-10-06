'use client'

import * as React from 'react'
import {
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpDown,
  ArrowLeftRight,
  SlidersHorizontal,
  PackageX,
  ShoppingCart,
  Undo2,
  ClipboardCheck,
  MapPin,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Branch, Movement } from '../InventoryView'
import {
  ACCENT,
  Signed,
  EmptyState,
  Segmented,
  dayLabel,
  fullDateLabel,
  groupByDay,
  num,
  timeLabel,
  toISODate,
} from './shared'

interface Props {
  movements: Movement[]
  /** ⚡ v10: إجماليات + منحنى 14 يوم محسوبة في SQL من السيرفر (اختياري — fallback محلي لو غياب) */
  meta?: MovementMeta | null
  branches: Branch[]
  isEmployee: boolean
  userBranchId: number | null
  onChanged: () => void
}

export interface MovementMeta {
  total: number
  inTotal: number
  outTotal: number
  series: { date: string; inn: number; out: number }[]
}

const TYPE_LABELS: Record<string, string> = {
  in: 'وارد',
  out: 'صادر',
  adjust: 'تعديل يدوي',
  damage: 'هالك',
  sale: 'بيع',
  return: 'مرتجع',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  stocktake: 'تسوية جرد',
}

const TYPE_META: Record<string, { icon: LucideIcon; color: string }> = {
  in: { icon: ArrowDownToLine, color: '#10b981' },
  out: { icon: ArrowUpFromLine, color: '#f43f5e' },
  adjust: { icon: SlidersHorizontal, color: '#f59e0b' },
  damage: { icon: PackageX, color: '#e11d48' },
  sale: { icon: ShoppingCart, color: '#0ea5e9' },
  return: { icon: Undo2, color: '#8b5cf6' },
  transfer_in: { icon: ArrowLeftRight, color: '#14b8a6' },
  transfer_out: { icon: ArrowLeftRight, color: '#f97316' },
  stocktake: { icon: ClipboardCheck, color: '#6366f1' },
}
const metaOf = (t: string) => TYPE_META[t] ?? { icon: ArrowUpDown, color: '#64748b' }

type Period = 'all' | 'today' | 'week' | 'month'

function periodRange(p: Period): { from: string; to: string } {
  if (p === 'all') return { from: '', to: '' }
  const now = new Date()
  const to = toISODate(now)
  if (p === 'today') return { from: to, to }
  if (p === 'week') {
    const s = new Date(now)
    s.setDate(now.getDate() - 6)
    return { from: toISODate(s), to }
  }
  return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to }
}

export function MovementsTab({ movements, meta, branches, isEmployee, userBranchId: _userBranchId, onChanged: _onChanged }: Props) {
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  // ⚡ v10 (2026-10-06): الـ API بيرجّع 50 حركة/صفحة من السيرفر + الإجماليات
  // والمنحنى محسوبة جوه PostgreSQL — بدل 1000 صف كاملين في كل تحميل/فلتر
  // (كان ده بيحرق CPU الـ Worker ⇒ Error 1102). التنقل بين الصفحات بقى
  // طلب سيرفر خفيف، والفلاتر بتترسل للسيرفر (كانت كده أصلاً).
  const [liveMovements, setLiveMovements] = React.useState<Movement[]>(movements)
  const [liveMeta, setLiveMeta] = React.useState<MovementMeta | null>(meta ?? null)
  React.useEffect(() => { setLiveMovements(movements) }, [movements])
  React.useEffect(() => { setLiveMeta(meta ?? null) }, [meta])

  const [serverPage, setServerPage] = React.useState(1)
  React.useEffect(() => { setServerPage(1) }, [branchFilter, typeFilter, from, to, search])

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (branchFilter !== 'all') params.set('branchId', branchFilter)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (search.trim()) params.set('q', search.trim())
    params.set('page', String(serverPage))
    params.set('limit', '50')
    const url = `/api/inventory/movements?${params.toString()}`
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (!alive) return
        if (Array.isArray(json)) {
          // fallback احتياطي لو الرد مصفوفة قديمة الشكل
          setLiveMovements(json as Movement[])
          setLiveMeta(null)
        } else {
          setLiveMovements((json.data ?? []) as Movement[])
          setLiveMeta({
            total: json.total ?? json.data?.length ?? 0,
            inTotal: json.inTotal ?? 0,
            outTotal: json.outTotal ?? 0,
            series: json.series ?? [],
          })
        }
      } catch {}
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [branchFilter, typeFilter, from, to, search, serverPage])

  const filtered = liveMovements

  // ⚡ v10: التقسيم من السيرفر (الرد الحالي = صفحة واحدة بالظبط). fallback:
  // تقسيم محلي لو مفيش meta (بيانات قديمة).
  const PAGE_SIZE = 50
  const usingServerPages = liveMeta !== null
  const page = usingServerPages ? serverPage : serverPage
  const [legacyPage, setLegacyPage] = React.useState(1)
  React.useEffect(() => { setLegacyPage(1) }, [branchFilter, typeFilter, from, to, search, liveMovements])
  const localTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const totalPages = usingServerPages
    ? Math.max(1, Math.ceil((liveMeta?.total ?? 0) / PAGE_SIZE))
    : localTotalPages
  const activePage = usingServerPages ? page : Math.min(legacyPage, totalPages)
  const setPage = usingServerPages ? setServerPage : setLegacyPage
  const paged = React.useMemo(
    () => (usingServerPages
      ? filtered
      : filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE)),
    [filtered, usingServerPages, activePage]
  )

  // ⚡ v10: ميزان الحركة من SQL (فيه meta) — fallback حساب محلي على الصفحة الحالية
  const summary = React.useMemo(() => {
    if (liveMeta) {
      return { inTotal: liveMeta.inTotal, outTotal: liveMeta.outTotal, net: liveMeta.inTotal - liveMeta.outTotal }
    }
    let inTotal = 0, outTotal = 0
    for (const m of filtered) {
      if (m.quantity > 0) inTotal += m.quantity
      else outTotal += Math.abs(m.quantity)
    }
    return { inTotal, outTotal, net: inTotal - outTotal }
  }, [liveMeta, filtered])

  // آخر ١٤ يوم: وارد لأعلى، صادر لأسفل — التواريخ من السيرفر بتوقيت المحل
  const series = React.useMemo(() => {
    const days: { key: string; label: string; inn: number; out: number; today: boolean }[] = []
    if (liveMeta && liveMeta.series.length > 0) {
      liveMeta.series.forEach((s, i) => {
        days.push({
          key: s.date,
          label: String(Number(s.date.slice(8, 10)) || s.date.slice(8, 10)),
          inn: s.inn,
          out: s.out,
          today: i === liveMeta.series.length - 1,
        })
      })
      const max = Math.max(1, ...days.map((d) => Math.max(d.inn, d.out)))
      return { days, max }
    }
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      days.push({ key: toISODate(d), label: String(d.getDate()), inn: 0, out: 0, today: i === 0 })
    }
    const idx = new Map(days.map((d, i) => [d.key, i]))
    for (const m of filtered) {
      const dt = new Date(m.createdAt)
      if (isNaN(dt.getTime())) continue
      const i = idx.get(toISODate(dt))
      if (i === undefined) continue
      if (m.quantity > 0) days[i].inn += m.quantity
      else days[i].out += Math.abs(m.quantity)
    }
    const max = Math.max(1, ...days.map((d) => Math.max(d.inn, d.out)))
    return { days, max }
  }, [liveMeta, filtered])

  const groups = React.useMemo(() => groupByDay(paged, (m) => m.createdAt), [paged])

  const activePeriod: Period | null = React.useMemo(() => {
    for (const p of ['all', 'today', 'week', 'month'] as Period[]) {
      const r = periodRange(p)
      if (r.from === from && r.to === to) return p
    }
    return null
  }, [from, to])

  const applyPeriod = (p: Period) => {
    const r = periodRange(p)
    setFrom(r.from)
    setTo(r.to)
  }
  const clearFilters = () => {
    setSearch(''); setBranchFilter('all'); setTypeFilter('all'); setFrom(''); setTo('')
  }
  const hasFilters = !!(search || branchFilter !== 'all' || typeFilter !== 'all' || from || to)

  const flowTotal = summary.inTotal + summary.outTotal
  const inHalf = flowTotal ? (summary.inTotal / flowTotal) * 50 : 0
  const outHalf = flowTotal ? (summary.outTotal / flowTotal) * 50 : 0
  const BAR = 52 // px لكل نصف من الرسم

  return (
    <div className="space-y-5">
      {/* ═════════ ميزان الحركة ═════════ */}
      <section className="animate-in-up overflow-hidden rounded-3xl border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <ArrowUpDown className="size-4" />
              </span>
              ميزان الحركة
              <span className="text-xs font-normal text-muted-foreground">· {num(liveMeta?.total ?? filtered.length)} حركة</span>
            </div>

            <div className="flex items-baseline gap-2" dir="ltr">
              <span
                className={cn(
                  'text-5xl font-black tracking-tight tabular-nums',
                  summary.net > 0 && 'text-emerald-600 dark:text-emerald-400',
                  summary.net < 0 && 'text-rose-600 dark:text-rose-400',
                )}
              >
                <Signed value={summary.net} />
              </span>
              <span className="text-sm font-semibold text-muted-foreground" dir="rtl">وحدة صافي</span>
            </div>

            {/* ميزان وارد ⟷ صادر */}
            <div dir="ltr" className="space-y-2">
              <div className="relative h-4 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 right-1/2 rounded-s-full bg-gradient-to-l from-rose-400 to-rose-600 transition-all duration-slow ease-out"
                  style={{ width: `${outHalf}%` }}
                />
                <div
                  className="absolute inset-y-0 left-1/2 rounded-e-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-slow ease-out"
                  style={{ width: `${inHalf}%` }}
                />
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-background" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                  <ArrowUpFromLine className="size-3.5" />
                  صادر <Signed value={-summary.outTotal} />
                </span>
                <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  وارد <Signed value={summary.inTotal} />
                  <ArrowDownToLine className="size-3.5" />
                </span>
              </div>
            </div>
          </div>

          {/* رسم ١٤ يوم */}
          <div className="border-t bg-muted/25 p-5 sm:p-6 lg:border-s lg:border-t-0">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-bold">آخر ١٤ يوم</span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" />وارد</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-rose-500" />صادر</span>
              </span>
            </div>
            <div className="flex items-stretch gap-1.5" dir="ltr">
              {series.days.map((d) => {
                const hi = d.inn ? Math.max(4, Math.round((d.inn / series.max) * BAR)) : 0
                const ho = d.out ? Math.max(4, Math.round((d.out / series.max) * BAR)) : 0
                return (
                  <div
                    key={d.key}
                    className="group/d flex flex-1 flex-col items-center"
                    title={`${d.key}\nوارد ${num(d.inn)} · صادر ${num(d.out)}`}
                  >
                    <div className="flex items-end" style={{ height: BAR }}>
                      <span
                        className={cn('w-2.5 rounded-t-[3px] bg-emerald-500 transition-all sm:w-3', !d.today && 'opacity-55 group-hover/d:opacity-100')}
                        style={{ height: hi }}
                      />
                    </div>
                    <span className="my-1 h-px w-full bg-border" />
                    <div className="flex items-start" style={{ height: BAR }}>
                      <span
                        className={cn('w-2.5 rounded-b-[3px] bg-rose-500 transition-all sm:w-3', !d.today && 'opacity-55 group-hover/d:opacity-100')}
                        style={{ height: ho }}
                      />
                    </div>
                    <span className={cn('mt-1 text-[10px] tabular-nums', d.today ? 'font-extrabold text-sky-600 dark:text-sky-400' : 'text-muted-foreground')}>
                      {d.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ شريط الفلاتر ═════════ */}
      <section className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالصنف أو الباركود أو الملاحظة…"
              className="h-10 rounded-xl border-transparent bg-muted/60 pr-9 focus-visible:bg-background"
            />
          </div>
          {!isEmployee && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-10 w-full rounded-xl sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                <SelectItem value="none">بدون فرع</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Segmented<Period>
            value={activePeriod ?? ('__custom' as Period)}
            onChange={applyPeriod}
            accent={ACCENT.movements}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'today', label: 'اليوم' },
              { value: 'week', label: '٧ أيام' },
              { value: 'month', label: 'الشهر' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>من</span>
          <div className="w-40"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg text-xs" aria-label="من تاريخ" /></div>
          <span>إلى</span>
          <div className="w-40"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg text-xs" aria-label="إلى تاريخ" /></div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="size-3.5" />
              مسح الفلاتر
            </Button>
          )}
        </div>

        {/* نوع الحركة — شريط أيقونات قابل للتمرير */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <TypeButton active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="كل الأنواع" />
          {Object.keys(TYPE_LABELS).map((k) => (
            <TypeButton
              key={k}
              active={typeFilter === k}
              onClick={() => setTypeFilter(typeFilter === k ? 'all' : k)}
              label={TYPE_LABELS[k]}
              icon={metaOf(k).icon}
              color={metaOf(k).color}
            />
          ))}
        </div>
      </section>

      {/* ═════════ الدفتر: خط زمني ═════════ */}
      {groups.length === 0 ? (
        <EmptyState
          icon={ArrowUpDown}
          accent={ACCENT.movements}
          title={hasFilters ? 'مفيش حركات مطابقة' : 'الدفتر لسه فاضي'}
          hint={hasFilters ? 'جرّب تغيّر الفلاتر أو الفترة' : 'أي بيع أو توريد أو تحويل هيتسجل هنا لحظة حدوثه'}
          action={hasFilters ? <Button variant="outline" onClick={clearFilters}>مسح الفلاتر</Button> : undefined}
        />
      ) : (
        <div className="space-y-7">
          {groups.map((g) => {
            const dayIn = g.items.reduce((s, m) => s + (m.quantity > 0 ? m.quantity : 0), 0)
            const dayOut = g.items.reduce((s, m) => s + (m.quantity < 0 ? Math.abs(m.quantity) : 0), 0)
            return (
              <section key={g.key}>
                <header className="mb-1 flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center">
                    <span className="size-3.5 rounded-full border-[3px] border-sky-500 bg-background ring-4 ring-sky-500/15" />
                  </span>
                  <h3 className="text-base font-extrabold">{dayLabel(g.key)}</h3>
                  <span className="h-px flex-1 bg-border" />
                  <span dir="ltr" className="flex items-center gap-2 text-xs font-bold tabular-nums">
                    {dayOut > 0 && <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-rose-600 dark:text-rose-400"><Signed value={-dayOut} /></span>}
                    {dayIn > 0 && <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400"><Signed value={dayIn} /></span>}
                  </span>
                </header>

                <div className="relative ps-12">
                  <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ insetInlineStart: 19.5 }} />
                  {g.items.map((m) => {
                    const meta = metaOf(m.type)
                    const incoming = m.quantity >= 0
                    return (
                      <article
                        key={m.id}
                        className="group relative flex items-center gap-3 rounded-xl border-b border-dashed px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/40"
                      >
                        <span
                          className="absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card"
                          style={{ insetInlineStart: -44, borderColor: meta.color, color: meta.color }}
                        >
                          <meta.icon className="size-3.5" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h4 className="truncate font-bold leading-tight">{m.product?.name ?? '—'}</h4>
                            <span className="text-xs font-bold" style={{ color: meta.color }}>
                              {TYPE_LABELS[m.type] ?? m.type}
                            </span>
                          </div>
                          {m.note && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{m.note}</p>}
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="tabular-nums" title={fullDateLabel(m.createdAt)}>{timeLabel(m.createdAt)}</span>
                            {m.branch?.name && (
                              <span className="flex items-center gap-1"><MapPin className="size-3" />{m.branch.name}</span>
                            )}
                            {m.userName && (
                              <span className="flex items-center gap-1"><User className="size-3" />{m.userName}</span>
                            )}
                            {m.product?.barcode && <span dir="ltr" className="font-mono">{m.product.barcode}</span>}
                          </p>
                        </div>

                        <div
                          dir="ltr"
                          className={cn(
                            'flex min-w-[4.75rem] shrink-0 flex-col items-center rounded-xl px-3 py-1.5 font-mono',
                            incoming ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
                          )}
                        >
                          <span className="text-xl font-black leading-none tabular-nums"><Signed value={m.quantity} /></span>
                          <span className="mt-0.5 font-sans text-[10px] font-medium opacity-70">وحدة</span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ⚡ v10: تنقّل الدفتر — 50 حركة/صفحة من السيرفر (الإجماليات فوق من SQL) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {(activePage - 1) * PAGE_SIZE + 1}–{Math.min(activePage * PAGE_SIZE, liveMeta?.total ?? filtered.length)} من {num(liveMeta?.total ?? filtered.length)} حركة
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8" disabled={activePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>السابق</Button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">{activePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={activePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function TypeButton({
  active,
  onClick,
  label,
  icon: Icon,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: LucideIcon
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
        !active && 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      style={active ? { borderColor: color ?? ACCENT.movements, backgroundColor: `${color ?? ACCENT.movements}1a`, color: color ?? ACCENT.movements } : undefined}
    >
      {Icon && <Icon className="size-3.5" style={{ color }} />}
      {label}
    </button>
  )
}
