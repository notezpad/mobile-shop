'use client'

import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Crown, FileText, PackageX, Sparkles } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { BRAND, baseDocStyles, fmt as fmtMoney, openPrintWindow } from '@/lib/print'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Branch {
  id: number
  name: string
}

interface Report {
  from: string | null
  to: string | null
  branches: Branch[]
  totalSales: number
  totalProfit: number
  profitMargin: number
  salesCount: number
  avgOrderValue: number
  maintenanceRevenue: number
  maintenanceCount: number
  totalExpenses: number
  netProfit: number
  changes: {
    totalSales: number | null
    totalProfit: number | null
    salesCount: number | null
    netProfit: number | null
  }
  salesTrend: { date: string; total: number; profit: number }[]
  topProducts: { name: string; qty: number; total: number; profit: number }[]
  categoryBreakdown: { category: string; total: number }[]
  topCustomers: { name: string; total: number; salesCount: number }[]
  paymentMethods: { method: string; amount: number }[]
  financeIn: number
  financeOut: number
  cashBalance: number
  expensesByCategory: { category: string; amount: number }[]
  customersReceivable: number
  suppliersPayable: number
  stockValueCost: number
  stockValuePrice: number
  lowStockCount: number
  lowStockProducts: { name: string; quantity: number; minQuantity: number }[]
  totalPurchases: number
  purchasesCount: number
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'محافظ إلكترونية',
  fawry: 'محفظة إلكترونية',
}

function pad(d: Date) {
  const x = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${x(d.getMonth() + 1)}-${x(d.getDate())}`
}

function shortDate(iso: string) {
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

/* ───────────── هوية التقارير: «نشرة تحليلية» — بنفسجي فوق أسطح محايدة ───────────── */
const V = '#7c3aed'
const F = '#d946ef'
const GRAD = `linear-gradient(to left, ${V}, ${F})`
const MIX = [V, F, '#06b6d4', '#f59e0b']
const num = formatNumber
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_ORDER = [6, 0, 1, 2, 3, 4, 5] // السبت → الجمعة
const dow = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}م`
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}ك`
  return num(Math.round(n))
}

export function ReportsView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [branchId, setBranchId] = React.useState<string>('all')
  const [report, setReport] = React.useState<Report | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [activePreset, setActivePreset] = React.useState<'today' | 'week' | 'month' | 'all' | null>('month')
  const [active, setActive] = React.useState('ch-rhythm')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (branchId !== 'all') params.set('branchId', branchId)
      setReport(await api<Report>(`/api/reports?${params.toString()}`))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }, [from, to, branchId])

  React.useEffect(() => {
    load()
  }, [load])

  // live refresh — التقرير بيجمع مبيعات ومصروفات وخزنة ومنتجات
  useDataRefresh(['sales', 'expenses', 'cash', 'products'], load)

  const setQuickRange = (preset: 'today' | 'week' | 'month' | 'all') => {
    setActivePreset(preset)
    const now = new Date()
    if (preset === 'today') {
      setFrom(pad(now))
      setTo(pad(now))
    } else if (preset === 'week') {
      const s = new Date(now)
      s.setDate(now.getDate() - 6)
      setFrom(pad(s))
      setTo(pad(now))
    } else if (preset === 'month') {
      setFrom(pad(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(pad(now))
    } else {
      setFrom('')
      setTo('')
    }
  }

  const exportPdf = () => {
    if (!report) return
    const html = buildReportHtml(report, from, to, {
      name: shopName,
      phone: shopBranding.phone || undefined,
      address: shopBranding.address || undefined,
      logo: shopBranding.logoPath || undefined,
    })
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  // scroll-spy لفهرس الفصول
  React.useEffect(() => {
    if (!report) return
    const ids = ['ch-rhythm', 'ch-leaders', 'ch-stock', ...(hasFinance ? ['ch-finance'] : [])]
    const els = ids.map((i) => document.getElementById(i)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-25% 0px -65% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [!!report, hasFinance])

  const ins = React.useMemo(() => {
    if (!report) return null
    const t = report.salesTrend
    const wd = WD_ORDER.map((d) => ({ d, sum: 0, n: 0 }))
    t.forEach((x) => {
      const w = wd.find((k) => k.d === dow(x.date))
      if (w) {
        w.sum += x.total
        w.n += 1
      }
    })
    const avgs = wd.map((w) => ({ ...w, avg: w.n ? w.sum / w.n : 0 }))
    return {
      avgs,
      maxAvg: Math.max(1, ...avgs.map((a) => a.avg)),
      best: t.reduce<(typeof t)[number] | null>((b, x) => (!b || x.total > b.total ? x : b), null),
      netMargin: pct(report.netProfit, report.totalSales),
      expRatio: pct(report.totalExpenses, report.totalSales),
    }
  }, [report])

  const chapters = [
    { id: 'ch-rhythm', n: '٠١', label: 'الإيقاع' },
    { id: 'ch-leaders', n: '٠٢', label: 'الأبطال' },
    { id: 'ch-stock', n: '٠٣', label: 'المخزون' },
    ...(hasFinance ? [{ id: 'ch-finance', n: '٠٤', label: 'المالية' }] : []),
  ]
  const branchLabel =
    branchId === 'all' ? 'كل الفروع' : report?.branches.find((b) => String(b.id) === branchId)?.name ?? 'فرع'
  const r = report

  return (
    <div className="space-y-6">
      {/* ═════════ شريط التحكم — زجاجي لاصق ═════════ */}
      <div className="animate-in-up sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/80 p-2 shadow-sm backdrop-blur-md">
        <div className="flex rounded-xl bg-muted p-1">
          {(['today', 'week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuickRange(p)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-base ease-out',
                activePreset === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p === 'today' ? 'اليوم' : p === 'week' ? 'أسبوع' : p === 'month' ? 'شهر' : 'الكل'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActivePreset(null) }} className="h-9 w-[132px] rounded-xl text-xs" aria-label="من" />
          <span className="text-xs text-muted-foreground">←</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset(null) }} className="h-9 w-[132px] rounded-xl text-xs" aria-label="إلى" />
        </div>
        {r && r.branches.length > 1 && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {r.branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={exportPdf} disabled={loading || !r} className="ms-auto h-9 rounded-xl border-0 text-white shadow-md shadow-violet-600/25" style={{ background: GRAD }}>
          <FileText className="size-4" />
          تصدير PDF
        </Button>
      </div>

      {!r ? (
        <div className="space-y-5">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-[420px] w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity duration-base', loading && 'opacity-60')}>
          {/* ═════════ الافتتاحية: جملة مولَّدة من الأرقام ═════════ */}
          <header className="animate-in-up space-y-3 px-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: GRAD }}>
                <Sparkles className="size-3" />
                تقرير الأداء
              </span>
              <CalendarDays className="size-3.5" />
              {from || to ? `${from || 'بداية النشاط'} ← ${to || 'الآن'}` : 'من بداية النشاط'} · {branchLabel}
            </p>
            <h1 className="max-w-4xl text-2xl font-extrabold leading-[1.9] tracking-tight sm:text-3xl sm:leading-[1.9]">
              {r.salesCount === 0 ? (
                'مفيش مبيعات مسجّلة في الفترة دي — جرّب توسّع المدى الزمني أو غيّر الفرع.'
              ) : (
                <>
                  حقق المحل <Hl>{num(Math.round(r.totalSales))} جنيه</Hl> مبيعات من <Hl>{num(r.salesCount)} فاتورة</Hl>
                  {r.changes.totalSales != null && (
                    <>
                      ، {r.changes.totalSales >= 0 ? 'بارتفاع' : 'بانخفاض'} <Hl>{Math.abs(r.changes.totalSales).toFixed(0)}٪</Hl> عن الفترة السابقة
                    </>
                  )}
                  . {r.netProfit >= 0 ? 'وصافي الربح' : 'وصافي الخسارة'} بعد المصروفات <Hl>{num(Math.round(Math.abs(r.netProfit)))} جنيه</Hl> بهامش{' '}
                  <Hl>{(ins?.netMargin ?? 0).toFixed(0)}٪</Hl>.
                </>
              )}
            </h1>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              {ins?.best && ins.best.total > 0 && (
                <Chip icon={<Crown className="size-3" />}>أقوى يوم {shortDate(ins.best.date)} · {formatCurrency(ins.best.total)}</Chip>
              )}
              {r.topProducts[0] && <Chip icon={<Sparkles className="size-3" />}>الأكثر إيراداً: {r.topProducts[0].name}</Chip>}
              {r.lowStockCount > 0 && (
                <Chip tone="warn" icon={<PackageX className="size-3" />}>{num(r.lowStockCount)} صنف تحت الحد الأدنى</Chip>
              )}
            </div>
          </header>

          {/* ═════════ المسرح: المنحنى + شريط الإشارات ═════════ */}
          <Stage r={r} ins={ins} />

          {/* ═════════ فهرس الفصول + المحتوى ═════════ */}
          <div className="grid gap-6 lg:grid-cols-[132px_minmax(0,1fr)]">
            <nav className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-24 lg:flex-col lg:self-start lg:overflow-visible" aria-label="فصول التقرير">
              {chapters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors',
                    active === c.id ? 'bg-gradient-to-l from-violet-600/15 to-fuchsia-500/15 text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  <span className={cn('font-black tabular-nums', active === c.id ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/50')}>{c.n}</span>
                  {c.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 space-y-12">
              {/* ───── ٠١ الإيقاع ───── */}
              <Chapter id="ch-rhythm" n="٠١" title="إيقاع البيع" hint="امتى بتبيع، وبإيه بيدفعوا، وإيه اللي بيتباع">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="إيقاع الأسبوع" hint="متوسط مبيعات كل يوم — الأغمق = الأقوى">
                    {ins && ins.avgs.some((a) => a.n) ? (
                      <>
                        <div className="grid grid-cols-7 gap-1.5">
                          {ins.avgs.map((a) => {
                            const k = a.avg / ins.maxAvg
                            return (
                              <div
                                key={a.d}
                                title={`${WD[a.d]}: متوسط ${formatCurrency(a.avg)} على ${a.n} يوم`}
                                className={cn('flex flex-col items-center justify-between rounded-xl px-1 py-3 text-center', k === 1 && a.avg > 0 && 'ring-2 ring-violet-500')}
                                style={{ background: `rgba(124,58,237,${0.06 + k * 0.45})` }}
                              >
                                <span className="text-[10px] font-semibold">{WD[a.d]}</span>
                                <span className="mt-4 text-xs font-extrabold tabular-nums">{a.n ? compact(a.avg) : '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                        {ins.best && <p className="mt-3 text-[11px] text-muted-foreground">أقوى يوم بالتاريخ: <b className="text-foreground">{shortDate(ins.best.date)}</b> — {formatCurrency(ins.best.total)}</p>}
                      </>
                    ) : (
                      <Empty t="لا توجد مبيعات كفاية لرسم الإيقاع" />
                    )}
                  </Panel>

                  <Panel title="طرق الدفع" hint="توزيع المقبوضات">
                    {r.paymentMethods.length > 0 ? (
                      <PayMix items={r.paymentMethods} />
                    ) : (
                      <Empty t="لا توجد بيانات" />
                    )}
                  </Panel>

                  <Panel title="المبيعات حسب التصنيف" className="lg:col-span-2">
                    {r.categoryBreakdown.length > 0 ? (
                      <ShareList items={r.categoryBreakdown.map((c) => ({ label: c.category, value: c.total }))} total={r.totalSales} />
                    ) : (
                      <Empty t="لا توجد بيانات" />
                    )}
                  </Panel>
                </div>
              </Chapter>

              {/* ───── ٠٢ الأبطال ───── */}
              <Chapter id="ch-leaders" n="٠٢" title="الأبطال" hint="المنتجات والعملاء اللي شايلين الفترة">
                <div className="grid gap-4 lg:grid-cols-5">
                  <Panel title="أفضل المنتجات" hint="الشريط = الإيراد · الجزء الملوّن = الربح · النسبة = الهامش" className="lg:col-span-3">
                    {r.topProducts.length > 0 ? (
                      <ul className="space-y-3.5">
                        {r.topProducts.map((p, i) => {
                          const mg = pct(p.profit, p.total)
                          const maxP = Math.max(1, ...r.topProducts.map((x) => x.total))
                          return (
                            <li key={i} className="flex items-center gap-3">
                              <span className="w-7 shrink-0 text-center text-2xl font-black leading-none tabular-nums text-muted-foreground/30">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                  <span className="truncate font-semibold">{p.name}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{num(p.qty)} قطعة · <b className="text-foreground">{formatCurrency(p.total)}</b></span>
                                </div>
                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                                  <div className="relative h-full rounded-full" style={{ width: `${Math.max(4, (p.total / maxP) * 100)}%`, background: `${V}33` }}>
                                    <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, mg))}%`, background: GRAD }} />
                                  </div>
                                </div>
                              </div>
                              <span className="shrink-0 rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-fuchsia-600 dark:text-fuchsia-400">{mg.toFixed(0)}٪</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <Empty t="لا توجد بيانات" />
                    )}
                  </Panel>

                  <Panel title="أفضل العملاء" hint="نسبة من إجمالي المبيعات" className="lg:col-span-2">
                    {r.topCustomers.length > 0 ? (
                      <ul className="space-y-3.5">
                        {r.topCustomers.map((c, i) => (
                          <li key={i} className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: GRAD }}>
                              {c.name.trim().charAt(0) || '؟'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground">{num(c.salesCount)} فاتورة</p>
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="text-xs font-bold tabular-nums">{formatCurrency(c.total)}</p>
                              <p className="text-[10px] tabular-nums text-muted-foreground">{pct(c.total, r.totalSales).toFixed(0)}٪</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty t="لا توجد مبيعات مرتبطة بعملاء" />
                    )}
                  </Panel>
                </div>
              </Chapter>

              {/* ───── ٠٣ المخزون ───── */}
              <Chapter id="ch-stock" n="٠٣" title="المخزون" hint="قيمة اللي على الرف، واللي لازم يتزوّد">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="قيمة المخزون" hint="التكلفة مقابل الربح المتوقع عند البيع">
                    {r.stockValuePrice > 0 ? (
                      <>
                        <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
                          <div className="h-full rounded-s-full" style={{ width: `${pct(r.stockValueCost, r.stockValuePrice)}%`, background: V }} />
                          <div className="h-full flex-1 rounded-e-full" style={{ background: F }} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div><p className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full" style={{ background: V }} />بالتكلفة</p><p className="mt-0.5 text-base font-extrabold tabular-nums">{formatCurrency(r.stockValueCost)}</p></div>
                          <div><p className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full" style={{ background: F }} />ربح متوقع</p><p className="mt-0.5 text-base font-extrabold tabular-nums">{formatCurrency(r.stockValuePrice - r.stockValueCost)}</p></div>
                        </div>
                        <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                          بسعر البيع: <b className="text-foreground">{formatCurrency(r.stockValuePrice)}</b> · مشتريات الفترة: <b className="text-foreground">{formatCurrency(r.totalPurchases)}</b> ({num(r.purchasesCount)} أمر)
                        </p>
                      </>
                    ) : (
                      <Empty t="لا توجد بيانات مخزون" />
                    )}
                  </Panel>

                  <Panel title="محتاجة تزويد" hint="الكمية الحالية مقابل الحد الأدنى">
                    {r.lowStockProducts.length > 0 ? (
                      <ul className="space-y-3">
                        {r.lowStockProducts.slice(0, 8).map((p, i) => (
                          <li key={i}>
                            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                              <span className="truncate font-semibold">{p.name}</span>
                              <span className={cn('shrink-0 tabular-nums font-bold', p.quantity === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}>
                                {num(p.quantity)} <span className="font-normal text-muted-foreground">/ {num(p.minQuantity)}</span>
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, pct(p.quantity, p.minQuantity)))}%`, background: p.quantity === 0 ? '#f43f5e' : '#f59e0b' }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty t="كل المنتجات فوق الحد الأدنى 👍" />
                    )}
                  </Panel>
                </div>
              </Chapter>

              {/* ───── ٠٤ المالية ───── */}
              {hasFinance && (
                <Chapter id="ch-finance" n="٠٤" title="المالية" hint="من هامش البيع لحد الصافي، وإيه اللي ليك وعليك">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="جسر الأرباح" hint={`هامش المبيعات + الصيانة (${num(r.maintenanceCount)} أمر) − المصروفات`} className="lg:col-span-2">
                      <Waterfall
                        steps={[
                          { label: 'هامش المبيعات', v: r.totalProfit },
                          { label: 'إيراد الصيانة', v: r.maintenanceRevenue },
                          { label: 'المصروفات', v: -r.totalExpenses },
                          { label: 'الصافي', v: r.netProfit, total: true },
                        ]}
                      />
                    </Panel>

                    <Panel title="المركز المالي" hint="الخزنة + ليك − عليك">
                      <div className="space-y-2.5 text-sm">
                        <Row label="رصيد الخزنة" value={r.cashBalance} />
                        <Row label="+ مستحقات على العملاء" value={r.customersReceivable} tone="pos" />
                        <Row label="− مستحقات للموردين" value={-r.suppliersPayable} tone="neg" />
                        <div className="flex items-center justify-between border-t pt-3">
                          <span className="font-extrabold">= صافي المركز</span>
                          <span className="bg-clip-text text-xl font-extrabold tabular-nums text-transparent" style={{ backgroundImage: GRAD }}>
                            {formatCurrency(r.cashBalance + r.customersReceivable - r.suppliersPayable)}
                          </span>
                        </div>
                      </div>
                    </Panel>

                    <Panel title="حركة الخزنة" hint="وارد مقابل صادر في الفترة">
                      <ShareList
                        items={[
                          { label: 'إيداعات', value: r.financeIn, color: '#10b981' },
                          { label: 'سحوبات', value: r.financeOut, color: '#f43f5e' },
                        ]}
                        total={r.financeIn + r.financeOut}
                      />
                      <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">الصافي: <b className="text-foreground">{formatCurrency(r.financeIn - r.financeOut)}</b></p>
                    </Panel>

                    <Panel title="المصروفات حسب التصنيف" className="lg:col-span-2">
                      {r.expensesByCategory.length > 0 ? (
                        <ShareList items={r.expensesByCategory.map((e) => ({ label: e.category, value: e.amount }))} total={r.totalExpenses} color="#f43f5e" />
                      ) : (
                        <Empty t="لا توجد مصروفات مسجلة في هذه الفترة" />
                      )}
                    </Panel>
                  </div>
                </Chapter>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═════════════════════ مكوّنات الهوية ═════════════════════ */

function Hl({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-lg bg-gradient-to-l from-violet-500/20 to-fuchsia-500/20 px-1.5 py-0.5 font-extrabold text-foreground">{children}</mark>
}

function Chip({ children, icon, tone }: { children: React.ReactNode; icon: React.ReactNode; tone?: 'warn' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5', tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-card text-muted-foreground')}>
      {icon}
      {children}
    </span>
  )
}

function Chapter({ id, n, title, hint, children }: { id: string; n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="animate-in-up scroll-mt-24 space-y-4">
      <div className="flex items-end gap-3">
        <span className="bg-clip-text text-5xl font-black leading-none tabular-nums text-transparent" style={{ backgroundImage: `linear-gradient(to bottom, ${V}, ${F})` }}>{n}</span>
        <div className="pb-0.5">
          <h2 className="text-lg font-extrabold leading-tight">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="mb-2 h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  )
}

function Panel({ title, hint, className, children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-3xl border bg-card p-5 shadow-sm', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-extrabold">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

const Empty = ({ t }: { t: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{t}</p>

function Row({ label, value, tone }: { label: string; value: number; tone?: 'pos' | 'neg' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-bold tabular-nums', tone === 'pos' && 'text-emerald-600 dark:text-emerald-400', tone === 'neg' && 'text-rose-600 dark:text-rose-400')}>{formatCurrency(value)}</span>
    </div>
  )
}

function ShareList({ items, total, color }: { items: { label: string; value: number; color?: string }[]; total: number; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const c = it.color ?? color ?? V
        return (
          <li key={i}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <span className="size-2 shrink-0 rounded-full" style={{ background: c }} />
                <span className="truncate">{it.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground"><b className="text-foreground">{formatCurrency(it.value)}</b> · {pct(it.value, total).toFixed(0)}٪</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all duration-slow ease-out" style={{ width: `${Math.max(3, (it.value / max) * 100)}%`, background: c }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PayMix({ items }: { items: { method: string; amount: number }[] }) {
  const merged = Object.values(
    items.reduce<Record<string, { label: string; value: number }>>((acc, m) => {
      const label = METHOD_LABELS[m.method] ?? m.method
      acc[label] = { label, value: (acc[label]?.value ?? 0) + m.amount }
      return acc
    }, {}),
  )
  const total = merged.reduce((s, x) => s + x.value, 0)
  return (
    <>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {merged.map((m, i) => (
          <div key={m.label} title={`${m.label}: ${formatCurrency(m.value)}`} className="h-full min-w-[6px] first:rounded-s-full last:rounded-e-full" style={{ width: `${pct(m.value, total)}%`, background: MIX[i % MIX.length] }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {merged.map((m, i) => (
          <li key={m.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium"><i className="size-2.5 rounded-full" style={{ background: MIX[i % MIX.length] }} />{m.label}</span>
            <span className="tabular-nums text-muted-foreground"><b className="text-foreground">{formatCurrency(m.value)}</b> · {pct(m.value, total).toFixed(0)}٪</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return null
  const max = Math.max(...v)
  const min = Math.min(...v)
  const rng = max - min || 1
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${26 - ((x - min) / rng) * 24}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" dir="ltr" className="mt-3 h-8 w-full">
      <polyline points={pts} fill="none" stroke={V} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Ring({ p, color }: { p: number; color: string }) {
  const R = 15
  const C = 2 * Math.PI * R
  const c = Math.max(0, Math.min(100, p))
  return (
    <svg viewBox="0 0 40 40" className="size-12 -rotate-90">
      <circle cx="20" cy="20" r={R} fill="none" strokeWidth="5" className="stroke-muted" />
      <circle cx="20" cy="20" r={R} fill="none" strokeWidth="5" strokeLinecap="round" stroke={color} strokeDasharray={C} strokeDashoffset={C - (C * c) / 100} className="transition-[stroke-dashoffset] duration-slow ease-out" />
    </svg>
  )
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return null
  const up = v >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', up ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(v).toFixed(0)}%
    </span>
  )
}

function Signal({ label, value, unit, delta, children }: { label: string; value: string; unit?: string; delta?: number | null; children?: React.ReactNode }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 flex items-baseline gap-1 truncate">
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">{value}</span>
            {unit && <span className="text-xs font-semibold text-muted-foreground">{unit}</span>}
          </p>
          {delta != null && <div className="mt-1.5 flex items-center gap-1.5"><Delta v={delta} /><span className="text-[10px] text-muted-foreground">عن السابقة</span></div>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </div>
  )
}

function StageTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div dir="rtl" className="rounded-xl border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-bold">{shortDate(String(label))}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <i className="size-2 rounded-full" style={{ background: p.color }} />
          {p.dataKey === 'total' ? 'المبيعات' : 'الربح'}
          <b className="ms-auto ps-3 tabular-nums">{formatCurrency(Number(p.value))}</b>
        </p>
      ))}
    </div>
  )
}

function Stage({ r, ins }: { r: Report; ins: { netMargin: number; expRatio: number } | null }) {
  const [m, setM] = React.useState<'both' | 'total' | 'profit'>('both')
  const t = r.salesTrend
  return (
    <section className="animate-in-up stagger-1 overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0">
        <div>
          <h2 className="text-base font-extrabold">منحنى المبيعات والربح</h2>
          <p className="text-[11px] text-muted-foreground">يوم بيوم — مرّر على الرسم لتفاصيل اليوم</p>
        </div>
        <div className="flex rounded-xl bg-muted p-1 text-xs font-semibold">
          {([['both', 'الاثنين'], ['total', 'المبيعات'], ['profit', 'الربح']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setM(k)} className={cn('rounded-lg px-3 py-1.5 transition-all duration-base', m === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
      </div>

      <div dir="ltr" className="h-72 px-2 pt-4">
        {t.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={t} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rpt-gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={V} stopOpacity={0.35} /><stop offset="100%" stopColor={V} stopOpacity={0} /></linearGradient>
                <linearGradient id="rpt-gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={F} stopOpacity={0.3} /><stop offset="100%" stopColor={F} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={11} width={44} />
              <Tooltip content={<StageTip />} cursor={{ stroke: V, strokeDasharray: '4 4' }} />
              {m !== 'profit' && <Area type="monotone" dataKey="total" stroke={V} strokeWidth={2.5} fill="url(#rpt-gv)" />}
              {m !== 'total' && <Area type="monotone" dataKey="profit" stroke={F} strokeWidth={2.5} fill="url(#rpt-gf)" />}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">لا توجد مبيعات في هذه الفترة</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px border-t bg-border lg:grid-cols-4">
        <Signal label="إجمالي المبيعات" value={num(Math.round(r.totalSales))} unit="جنيه" delta={r.changes.totalSales}>
          <div className="w-20"><Spark v={t.map((x) => x.total)} /></div>
        </Signal>
        <Signal label="صافي الربح" value={num(Math.round(r.netProfit))} unit="جنيه" delta={r.changes.netProfit}>
          <div className="relative">
            <Ring p={ins?.netMargin ?? 0} color={(ins?.netMargin ?? 0) >= 0 ? V : '#f43f5e'} />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums">{Math.round(ins?.netMargin ?? 0)}٪</span>
          </div>
        </Signal>
        <Signal label="عدد الفواتير" value={num(r.salesCount)} delta={r.changes.salesCount}>
          <p className="text-end text-[10px] text-muted-foreground">متوسط<br /><b className="text-xs text-foreground tabular-nums">{num(Math.round(r.avgOrderValue))}</b></p>
        </Signal>
        <Signal label="المصروفات من المبيعات" value={`${(ins?.expRatio ?? 0).toFixed(0)}٪`}>
          <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, ins?.expRatio ?? 0)}%` }} /></div>
        </Signal>
      </div>
    </section>
  )
}

function Waterfall({ steps }: { steps: { label: string; v: number; total?: boolean }[] }) {
  let run = 0
  const bars = steps.map((s) => {
    const start = s.total ? 0 : run
    const end = s.total ? s.v : run + s.v
    run = end
    return { ...s, start, end }
  })
  const all = bars.flatMap((b) => [b.start, b.end])
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const rng = hi - lo || 1
  const at = (v: number) => ((v - lo) / rng) * 100
  return (
    <div>
      <div className="relative mt-6 h-52">
        <div className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${at(0)}%` }} />
        <div className="absolute inset-0 flex gap-3">
          {bars.map((b, i) => {
            const color = b.total ? (b.end >= 0 ? GRAD : '#f43f5e') : b.v >= 0 ? '#10b981' : '#f43f5e'
            return (
              <div key={i} className="relative h-full flex-1">
                <div
                  className="absolute inset-x-2 rounded-lg transition-all duration-slow ease-out sm:inset-x-6"
                  style={{ bottom: `${at(Math.min(b.start, b.end))}%`, height: `${Math.max(1.5, (Math.abs(b.end - b.start) / rng) * 100)}%`, background: color }}
                />
                <span className="absolute inset-x-0 pb-1 text-center text-[11px] font-extrabold tabular-nums" style={{ bottom: `${at(Math.max(b.start, b.end))}%` }}>
                  {b.v < 0 && !b.total ? '−' : ''}{compact(Math.abs(b.v))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-3 border-t pt-2">
        {bars.map((b, i) => (
          <span key={i} className={cn('flex-1 text-center text-[11px]', b.total ? 'font-extrabold' : 'text-muted-foreground')}>{b.label}</span>
        ))}
      </div>
    </div>
  )
}

/* ═════════ تصدير PDF — بدون تغيير ═════════ */
function section(title: string, inner: string, accent?: string) {
  return `
    <div class="rpt-section">
      <div class="rpt-section-title" ${accent ? `style="border-inline-start-color:${accent}"` : ''}>${title}</div>
      ${inner}
    </div>
  `
}

function kpi(label: string, value: string, big?: boolean) {
  return `
    <div class="kpi-card ${big ? 'kpi-card-big' : ''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    </div>
  `
}

function emptyRow(colspan: number, text: string) {
  return `<tr><td colspan="${colspan}" style="color:${BRAND.sub};padding:16px">${text}</td></tr>`
}

function barRow(label: string, value: number, max: number, formatted: string, tone?: 'destructive') {
  const pct = Math.max(4, Math.round((value / max) * 100))
  const color = tone === 'destructive' ? BRAND.red : BRAND.primary
  return `
    <div class="bar-row">
      <div class="bar-row-top"><span>${label}</span><span>${formatted}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>
  `
}

function buildReportHtml(
  r: Report,
  from: string,
  to: string,
  shop?: { name?: string; phone?: string; address?: string; logo?: string }
): string {
  const range = `${from || 'بداية النشاط'}  ←  ${to || 'الآن'}`
  const generatedAt = fmtDateTime(new Date())

  const maxCategory = Math.max(1, ...(r.categoryBreakdown.map((c) => c.total) || [1]))
  const maxMethod = Math.max(1, ...(r.paymentMethods.map((m) => m.amount) || [1]))
  const maxExpense = Math.max(1, ...(r.expensesByCategory.map((e) => e.amount) || [1]))

  const topProductsRows = r.topProducts.length
    ? r.topProducts
        .map(
          (p, i) => `
        <tr>
          <td style="color:${BRAND.sub}">${i + 1}</td>
          <td style="text-align:right;font-weight:600">${escapeHtml(p.name)}</td>
          <td>${formatNumber(p.qty)}</td>
          <td>${fmtMoney(p.total)}</td>
          <td style="font-weight:700;color:${BRAND.primaryDark}">${fmtMoney(p.profit)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(5, 'لا توجد مبيعات في هذه الفترة')

  const topCustomersRows = r.topCustomers.length
    ? r.topCustomers
        .map(
          (c, i) => `
        <tr>
          <td style="color:${BRAND.sub}">${i + 1}</td>
          <td style="text-align:right;font-weight:600">${escapeHtml(c.name)}</td>
          <td>${formatNumber(c.salesCount)}</td>
          <td style="font-weight:700">${fmtMoney(c.total)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(4, 'لا توجد مبيعات مرتبطة بعملاء في هذه الفترة')

  const lowStockRows = r.lowStockProducts.length
    ? r.lowStockProducts
        .map(
          (p) => `
        <tr>
          <td style="text-align:right;font-weight:600">${escapeHtml(p.name)}</td>
          <td style="font-weight:700;color:${p.quantity === 0 ? BRAND.red : BRAND.amber}">${formatNumber(p.quantity)}</td>
          <td style="color:${BRAND.sub}">${formatNumber(p.minQuantity)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(3, 'كل المنتجات فوق الحد الأدنى للمخزون 👍')

  const expenseRows = r.expensesByCategory.length
    ? r.expensesByCategory
        .map((e) => `<tr><td style="text-align:right;font-weight:600">${escapeHtml(e.category)}</td><td style="font-weight:700;color:${BRAND.red}">${fmtMoney(e.amount)}</td></tr>`)
        .join('')
    : emptyRow(2, 'لا توجد المعاملات المالية مسجلة في هذه الفترة')

  const categoryBars = r.categoryBreakdown.length
    ? r.categoryBreakdown.map((c) => barRow(escapeHtml(c.category), c.total, maxCategory, fmtMoney(c.total))).join('')
    : `<p style="color:${BRAND.sub};font-size:12.5px">لا توجد بيانات</p>`

  const methodBars = r.paymentMethods.length
    ? r.paymentMethods
        .map((m) => barRow(escapeHtml(METHOD_LABELS[m.method] ?? m.method), m.amount, maxMethod, fmtMoney(m.amount)))
        .join('')
    : `<p style="color:${BRAND.sub};font-size:12.5px">لا توجد بيانات</p>`

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تقرير المحل ${range}</title>
<style>
  ${baseDocStyles()}
  .cover {
    background: linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary});
    color: #fff; border-radius: 12px; padding: 22px 26px; margin-bottom: 22px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .cover .shop-logo { height: 50px; width: 50px; object-fit: contain; border-radius: 10px; background: #fff; border: none; }
  .cover-title { font-size: 21px; font-weight: 800; }
  .cover-sub { font-size: 12px; opacity: .9; margin-top: 4px; }
  .cover-meta { text-align: left; font-size: 12px; opacity: .95; }
  .cover-meta b { font-size: 14px; display: block; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi-card { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 13px; background: #fafcfa; }
  .kpi-card-big { background: ${BRAND.primaryLight}; border-color: ${BRAND.primary}; }
  .kpi-label { font-size: 10.5px; color: ${BRAND.sub}; margin-bottom: 5px; }
  .kpi-value { font-size: 16.5px; font-weight: 800; color: ${BRAND.ink}; }
  .kpi-card-big .kpi-value { color: ${BRAND.primaryDark}; }
  .rpt-section { margin-bottom: 20px; break-inside: avoid; }
  .rpt-section-title {
    font-size: 13.5px; font-weight: 800; color: ${BRAND.ink}; margin-bottom: 10px;
    padding-inline-start: 10px; border-inline-start: 4px solid ${BRAND.primary};
  }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .bar-row { margin-bottom: 9px; }
  .bar-row-top { display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; }
  .bar-track { height: 7px; border-radius: 99px; background: ${BRAND.border}; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 99px; }
  .formula-box { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 14px 16px; font-size: 12.5px; }
  .formula-row { display: flex; justify-content: space-between; padding: 5px 0; }
  .formula-row.total { border-top: 2px solid ${BRAND.primaryLight}; margin-top: 4px; padding-top: 9px; font-weight: 800; font-size: 14px; color: ${BRAND.primaryDark}; }
  @media print {
    .rpt-section { page-break-inside: avoid; }
    .doc-footer::after {
      content: "صفحة " counter(page) " من " counter(pages);
      display: block; margin-top: 4px; font-size: 10px;
    }
  }
</style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
    <div class="cover">
      <div style="display:flex;align-items:center;gap:12px">
        ${shop?.logo ? `<img src="${shop.logo}" class="shop-logo" />` : ''}
        <div>
          <div class="cover-title">تقرير أداء المحل</div>
          <div class="cover-sub">${escapeHtml(shop?.name || 'محل الاتصالات')}${shop?.phone ? ` — ${escapeHtml(shop.phone)}` : ''}</div>
        </div>
      </div>
      <div class="cover-meta">
        <b>${escapeHtml(range)}</b>
        تم إنشاؤه: ${generatedAt}
      </div>
    </div>

    <div class="kpi-grid">
      ${kpi('إجمالي المبيعات', fmtMoney(r.totalSales) + ' ')}
      ${kpi('صافي الربح', fmtMoney(r.netProfit) + ' ', true)}
      ${kpi('عدد الفواتير', formatNumber(r.salesCount))}
      ${kpi('متوسط الفاتورة', fmtMoney(r.avgOrderValue) + ' ')}
      ${kpi('إيراد الصيانة', fmtMoney(r.maintenanceRevenue) + ' ')}
      ${kpi('إجمالي الالمعاملات المالية', fmtMoney(r.totalExpenses) + ' ')}
      ${kpi('رصيد الخزنة', fmtMoney(r.cashBalance) + ' ', true)}
      ${kpi('إجمالي المشتريات', fmtMoney(r.totalPurchases) + ' ')}
    </div>

    ${section(
      'أفضل المنتجات مبيعاً',
      `<table><thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr></thead><tbody>${topProductsRows}</tbody></table>`
    )}

    <div class="two-col">
      ${section(
        'أفضل العملاء',
        `<table><thead><tr><th>#</th><th>العميل</th><th>الفواتير</th><th>الإجمالي</th></tr></thead><tbody>${topCustomersRows}</tbody></table>`
      )}
      ${section('المبيعات حسب التصنيف', `<div style="padding-top:2px">${categoryBars}</div>`)}
    </div>

    <div class="two-col">
      ${section('طرق الدفع (المقبوضات)', `<div style="padding-top:2px">${methodBars}</div>`)}
      ${section(
        'الالمعاملات المالية حسب التصنيف',
        `<table><thead><tr><th>التصنيف</th><th>المبلغ</th></tr></thead><tbody>${expenseRows}</tbody></table>`
      )}
    </div>

    ${section(
      'تنبيهات نقص المخزون',
      `<table><thead><tr><th>المنتج</th><th>الكمية الحالية</th><th>الحد الأدنى</th></tr></thead><tbody>${lowStockRows}</tbody></table>`,
      BRAND.amber
    )}

    ${section(
      'الملخص المالي',
      `<div class="two-col">
        <div class="formula-box">
          <div class="formula-row"><span>هامش ربح المبيعات</span><span>${fmtMoney(r.totalProfit)} </span></div>
          <div class="formula-row"><span>+ إيراد الصيانة</span><span>${fmtMoney(r.maintenanceRevenue)} </span></div>
          <div class="formula-row"><span>− الالمعاملات المالية</span><span style="color:${BRAND.red}">${fmtMoney(r.totalExpenses)} </span></div>
          <div class="formula-row total"><span>= صافي الربح</span><span>${fmtMoney(r.netProfit)} </span></div>
        </div>
        <div class="formula-box">
          <div class="formula-row"><span>إيداعات مالية</span><span>${fmtMoney(r.financeIn)} </span></div>
          <div class="formula-row"><span>سحوبات مالية</span><span>${fmtMoney(r.financeOut)} </span></div>
          <div class="formula-row"><span>مستحقات على العملاء</span><span>${fmtMoney(r.customersReceivable)} </span></div>
          <div class="formula-row"><span>مستحقات للموردين</span><span style="color:${BRAND.red}">${fmtMoney(r.suppliersPayable)} </span></div>
        </div>
      </div>`
    )}

    <div class="doc-footer">
      <div class="thanks">${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
      <div>تقرير آلي تم إصداره بواسطة نظام إدارة المحل — ${generatedAt}</div>
    </div>
  </div>
</body>
</html>`
}

function fmtDateTime(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
