'use client'

import * as React from 'react'
import { useVocab } from '@/lib/vocab'
import { unitWord } from '@/lib/unit-label'
import { AlertTriangle, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, FileText, Inbox, Sparkles } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency as fmtCur, formatNumber } from '@/lib/format'
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
  totalProfit: number | null
  profitMargin: number | null
  canViewProfits?: boolean
  salesCount: number
  avgOrderValue: number
  maintenanceRevenue: number
  maintenanceCount: number
  totalExpenses: number
  netProfit: number | null
  changes: {
    totalSales: number | null
    totalProfit: number | null | null
    salesCount: number | null
    netProfit: number | null | null
  }
  salesTrend: { date: string; total: number; profit: number }[]
  topProducts: { name: string; qty: number; total: number; profit: number; unitLabel?: string | null }[]
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
const LRM = '\u200E'
const num = (n: number | null | undefined) => LRM + formatNumber(n)
const formatCurrency = (n: number | null | undefined) => LRM + fmtCur(n)
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_ORDER = [6, 0, 1, 2, 3, 4, 5]
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
  const tv = useVocab()
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')
  const [from, setFrom] = React.useState(() => rangeFor('month')[0])
  const [to, setTo] = React.useState(() => rangeFor('month')[1])
  const [branchId, setBranchId] = React.useState<string>('all')
  const [report, setReport] = React.useState<Report | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [activePreset, setActivePreset] = React.useState<PresetKey | null>('month')
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

  useDataRefresh(['sales', 'expenses', 'cash', 'products'], load)

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

  const rr = report
  const bestDay =
    ins && rr && rr.salesTrend.length >= 7
      ? ins.avgs.reduce((b, a) => (a.avg > b.avg ? a : b), ins.avgs[0])
      : null
  const chapters: ChapterItem[] = [
    { id: 'ch-rhythm', n: '01', label: 'الإيقاع', tone: 'info',
      note: bestDay && bestDay.avg > 0 ? `أقوى يوم: ${WD[bestDay.d]}` : rr ? `${num(rr.salesCount)} فاتورة في الفترة` : '' },
    { id: 'ch-leaders', n: '02', label: 'الأبطال', tone: 'info',
      note: rr?.topProducts[0] ? `الأول: ${rr.topProducts[0].name}` : 'مفيش مبيعات' },
    { id: 'ch-stock', n: '03', label: 'المخزون', tone: rr && rr.lowStockCount > 0 ? 'warn' : 'ok',
      note: rr && rr.lowStockCount > 0 ? `${num(rr.lowStockCount)} صنف تحت الحد` : 'كله فوق الحد الأدنى' },
    ...(hasFinance
      ? [{ id: 'ch-finance', n: '04', label: 'المالية', tone: (rr && rr.netProfit < 0 ? 'bad' : 'ok') as ChapterItem['tone'],
          note: rr ? (rr.netProfit < 0 ? `خسارة ${num(Math.round(Math.abs(rr.netProfit)))} جنيه` : `صافي ربح ${num(Math.round(rr.netProfit))} جنيه`) : '' }]
      : []),
  ]
  const branchLabel =
    branchId === 'all' ? 'كل الفروع' : report?.branches.find((b) => String(b.id) === branchId)?.name ?? 'فرع'
  const r = report

  return (
    <div id="rpt-top" className="space-y-4 sm:space-y-6">
      <FilterBar
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        preset={activePreset} setPreset={setActivePreset}
        branchId={branchId} setBranchId={setBranchId} branches={r?.branches ?? []}
        loading={loading} disabled={loading || !r} onExport={exportPdf}
      />

      {!r ? (
        <div className="space-y-4 sm:space-y-5">
          <Skeleton className="h-[380px] w-full rounded-3xl" />
          <Skeleton className="h-[420px] w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : (
        <div className={cn('space-y-4 transition-opacity duration-base sm:space-y-6', loading && 'opacity-70')}>
          <Hero r={r} ins={ins} hasFinance={hasFinance} shop={shopName} range={rangeText(from, to)} branch={branchLabel} />

          <Stage r={r} ins={ins} />

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
            <ChapterMap chapters={chapters} active={active} />

            <div className="min-w-0 space-y-8 sm:space-y-12">
              {/* ───── ٠١ الإيقاع ───── */}
              <Chapter id="ch-rhythm" n="01" title="إيقاع البيع" hint="امتى بتبيع، وبإيه بيدفعوا، وإيه اللي بيتباع">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="إيقاع الأسبوع" hint="متوسط مبيعات كل يوم — الأغمق = الأقوى">
                    {ins && r.salesTrend.length >= 7 ? (
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
                      <Empty t="محتاج أسبوع من البيانات على الأقل لرسم الإيقاع — وسّع المدى" />
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
              </Chapter>}

              {/* ───── ٠٢ الأبطال ───── */}
              <Chapter id="ch-leaders" n="02" title="الأبطال" hint={tv('المنتجات والعملاء اللي شايلين الفترة')}>
                <div className="grid gap-4 lg:grid-cols-5">
                  <Panel title={tv('أفضل المنتجات')} hint="الشريط = الإيراد · الجزء الملوّن = الربح · النسبة = الهامش" className="lg:col-span-3">
                    {r.topProducts.length > 0 ? (
                      <ul className="space-y-3.5">
                        {r.topProducts.map((p, i) => {
                          const mg = r.canViewProfits !== false ? pct(p.profit, p.total) : null
                          const maxP = Math.max(1, ...r.topProducts.map((x) => x.total))
                          return (
                            <li key={i} className="flex items-center gap-2 sm:gap-3">
                              <span className="w-6 shrink-0 text-center text-xl font-black leading-none tabular-nums text-muted-foreground/30 sm:w-7 sm:text-2xl">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                  <span className="truncate font-semibold">{p.name}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{num(p.qty)} {unitWord(p.qty, p.unitLabel)} · <b className="text-foreground">{formatCurrency(p.total)}</b></span>
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

                  <Panel title="أفضل العملاء" hint="نسبة من إجمالي المبيعات" className="flex flex-col lg:col-span-2">
                    {r.topCustomers.length > 0 ? (
                      <>
                        <ul className="space-y-3.5">
                          {r.topCustomers.map((c, i) => (
                            <li key={i} className="flex items-center gap-2.5 sm:gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white sm:size-9 sm:text-sm" style={{ background: GRAD }}>
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
                        {(() => {
                          const share = Math.min(100, pct(r.topCustomers.reduce((t, c) => t + c.total, 0), r.totalSales))
                          return (
                            <div className="mt-auto border-t border-dashed pt-4">
                              <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                                <span className="text-muted-foreground">تركّز المبيعات في أفضل {num(r.topCustomers.length)} {r.topCustomers.length === 1 ? 'عميل' : 'عملاء'}</span>
                                <b className="tabular-nums">{share.toFixed(0)}٪</b>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(3, share)}%`, background: GRAD }} />
                              </div>
                              <p className="mt-1.5 text-[10px] text-muted-foreground">الباقي مبيعات لعملاء تانيين أو بدون عميل</p>
                            </div>
                          )
                        })()}
                      </>
                    ) : (
                      <Empty t="لا توجد مبيعات مرتبطة بعملاء" />
                    )}
                  </Panel>
                </div>
              </Chapter>

              {/* ───── ٠٣ المخزون ───── */}
              <Chapter id="ch-stock" n="03" title="المخزون" hint="قيمة اللي على الرف، واللي لازم يتزوّد">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="قيمة المخزون" hint="التكلفة مقابل الربح المتوقع عند البيع">
                    {r.stockValuePrice > 0 ? (
                      <>
                        <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
                          <div className="h-full rounded-s-full" style={{ width: `${pct(r.stockValueCost, r.stockValuePrice)}%`, background: V }} />
                          <div className="h-full flex-1 rounded-e-full" style={{ background: F }} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div><p className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full" style={{ background: V }} />بالتكلفة</p><p className="mt-0.5 min-w-0 break-all text-base font-extrabold tabular-nums">{formatCurrency(r.stockValueCost)}</p></div>
                          <div><p className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full" style={{ background: F }} />ربح متوقع</p><p className="mt-0.5 min-w-0 break-all text-base font-extrabold tabular-nums">{formatCurrency(r.stockValuePrice - r.stockValueCost)}</p></div>
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
                      <Empty ok t={tv('كل المنتجات فوق الحد الأدنى')} />
                    )}
                  </Panel>
                </div>
              </Chapter>

              {/* ───── ٠٤ المالية ───── */}
              {hasFinance && (
                {r.canViewProfits !== false && <Chapter id="ch-finance" n="04" title="المالية" hint="من هامش البيع لحد الصافي، وإيه اللي ليك وعليك">
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
                        <div className="flex items-center justify-between gap-2 border-t pt-3">
                          <span className="shrink-0 font-extrabold">= صافي المركز</span>
                          <span className="min-w-0 break-all bg-clip-text text-lg font-extrabold tabular-nums text-transparent sm:text-xl" style={{ backgroundImage: GRAD }}>
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

/* ═════════════════════ الفلتر والهيرو ═════════════════════ */

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'all'
const PRESETS: { k: PresetKey; l: string }[] = [
  { k: 'today', l: 'اليوم' },
  { k: 'yesterday', l: 'امبارح' },
  { k: '7d', l: 'آخر 7 أيام' },
  { k: '30d', l: 'آخر 30 يوم' },
  { k: 'month', l: 'الشهر ده' },
  { k: 'lastMonth', l: 'الشهر اللي فات' },
  { k: 'year', l: 'السنة دي' },
  { k: 'all', l: 'كل الفترة' },
]
const QUICK: PresetKey[] = ['today', '7d', 'month', 'all']

function rangeFor(k: PresetKey): [string, string] {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth()
  const ago = (d: number) => new Date(y, m, n.getDate() - d)
  switch (k) {
    case 'today': return [pad(n), pad(n)]
    case 'yesterday': return [pad(ago(1)), pad(ago(1))]
    case '7d': return [pad(ago(6)), pad(n)]
    case '30d': return [pad(ago(29)), pad(n)]
    case 'month': return [pad(new Date(y, m, 1)), pad(n)]
    case 'lastMonth': return [pad(new Date(y, m - 1, 1)), pad(new Date(y, m, 0))]
    case 'year': return [pad(new Date(y, 0, 1)), pad(n)]
    default: return ['', '']
  }
}

const dmy = (iso: string) => iso.split('-').reverse().join('/')
function rangeText(from: string, to: string) {
  if (!from && !to) return 'من بداية النشاط'
  if (from && from === to) return dmy(from)
  return `${from ? dmy(from) : 'البداية'} ← ${to ? dmy(to) : 'الآن'}`
}
function daysIn(from: string, to: string) {
  if (!from || !to) return null
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  })
  return Math.round((b - a) / 86400000) + 1
}

function FilterBar({
  from, to, setFrom, setTo, preset, setPreset, branchId, setBranchId, branches, loading, disabled, onExport,
}: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void
  preset: PresetKey | null; setPreset: (k: PresetKey | null) => void
  branchId: string; setBranchId: (v: string) => void; branches: Branch[]
  loading: boolean; disabled: boolean; onExport: () => void
}) {
  const days = daysIn(from, to)
  const [open, setOpen] = React.useState(false)

  const apply = (k: PresetKey) => {
    const [f, t] = rangeFor(k)
    setFrom(f); setTo(t); setPreset(k)
  }

  return (
    <div className="sticky top-0 z-20 overflow-hidden rounded-2xl border bg-background/80 shadow-sm backdrop-blur-xl">
      <style>{`@keyframes rpt-slide{0%{transform:translateX(-120%)}100%{transform:translateX(420%)}}`}</style>

      {/* ── هيدر الطي: يظهر على الجوال فقط ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="rpt-filter-body"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start sm:hidden"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="min-w-0 truncate text-xs font-bold tabular-nums">{rangeText(from, to)}</span>
          {days && <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">{days} يوم</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={cn('size-2 rounded-full', loading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500')} />
          <ChevronDown className={cn('size-4 opacity-60 transition-transform duration-base', open && 'rotate-180')} />
        </span>
      </button>

      {/* ── جسم الفلتر: قابل للطي على الجوال، دائمًا ظاهر على sm+ ── */}
      <div
        id="rpt-filter-body"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-base ease-out sm:grid-rows-[1fr] sm:opacity-100',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 p-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-bold shadow-xs transition-colors hover:bg-muted/60 sm:w-auto">
                  <CalendarDays className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className="min-w-0 truncate tabular-nums">{rangeText(from, to)}</span>
                  {days && <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">{days} يوم</span>}
                  <ChevronDown className="ms-auto size-3.5 shrink-0 opacity-60 sm:ms-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(310px,calc(100vw-2rem))] rounded-2xl p-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.k}
                      type="button"
                      onClick={() => apply(p.k)}
                      className={cn('rounded-xl border px-3 py-2 text-xs font-semibold transition-colors', preset === p.k ? 'border-transparent text-white' : 'hover:bg-muted/60')}
                      style={preset === p.k ? { background: GRAD } : undefined}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                  <label className="space-y-1 text-[11px] font-medium text-muted-foreground">من
                    <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(null) }} className="h-9 rounded-xl text-xs" />
                  </label>
                  <label className="space-y-1 text-[11px] font-medium text-muted-foreground">إلى
                    <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(null) }} className="h-9 rounded-xl text-xs" />
                  </label>
                </div>
              </PopoverContent>
            </Popover>

            <Seg<PresetKey>
              label="الفترة السريعة"
              value={QUICK.includes(preset as PresetKey) ? preset : null}
              onChange={apply}
              options={QUICK.map((k) => ({ v: k, l: PRESETS.find((p) => p.k === k)!.l }))}
            />

            {branches.length > 1 && (
              <Seg<string>
                label="الفرع"
                value={branchId}
                onChange={setBranchId}
                options={[{ v: 'all', l: 'كل الفروع' }, ...branches.map((b) => ({ v: String(b.id), l: b.name }))]}
              />
            )}

            <span className="hidden items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground sm:flex sm:ms-auto" aria-live="polite">
              <span className={cn('size-2 rounded-full', loading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500')} />
              {loading ? 'بيحدّث…' : 'مباشر'}
            </span>

            <Button onClick={onExport} disabled={disabled} className="h-10 w-full rounded-xl border-0 text-white shadow-md shadow-violet-600/25 sm:w-auto" style={{ background: GRAD }}>
              <FileText className="size-4 shrink-0" />
              <span className="truncate">تصدير PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden motion-reduce:hidden">
          <span className="block h-full w-1/4 rounded-full" style={{ background: GRAD, animation: 'rpt-slide 1.1s ease-in-out infinite' }} />
        </span>
      )}
    </div>
  )
}

function Hero({
  r, ins, hasFinance, shop, range, branch,
}: {
  r: Report
  ins: { best: { date: string; total: number } | null; netMargin: number; expRatio: number } | null
  hasFinance: boolean; shop: string; range: string; branch: string
}) {
  const netMargin = ins?.netMargin ?? 0
  const ch = r.changes.totalSales
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const verdict =
    r.salesCount === 0 ? { t: 'مفيش بيانات', d: 'مفيش مبيعات في الفترة دي', c: '#94a3b8', tx: 'text-slate-500 dark:text-slate-400' }
    : r.netProfit < 0 ? { t: 'خسارة', d: 'المصروفات أكبر من الربح', c: '#f43f5e', tx: 'text-rose-600 dark:text-rose-400' }
    : netMargin < 10 ? { t: 'ربح ضعيف', d: 'هامش الصافي أقل من 10٪', c: '#f59e0b', tx: 'text-amber-700 dark:text-amber-400' }
    : (ch ?? 0) < 0 ? { t: 'مستقر', d: 'ربح كويس والمبيعات أقل من السابقة', c: V, tx: 'text-violet-700 dark:text-violet-300' }
    : { t: 'أداء قوي', d: ch == null ? 'ربح صحي بهامش كويس' : 'ربح صحي ومبيعات في صعود', c: '#10b981', tx: 'text-emerald-700 dark:text-emerald-400' }

  const loss = r.netProfit < 0
  const topExp = r.expensesByCategory?.[0]
  const extra: React.ReactNode[] = []
  if (loss && topExp && topExp.amount > 0)
    extra.push(<>أكبر بند في المصروفات «{topExp.category}» بـ <Hl tone="bad">{num(Math.round(topExp.amount))} جنيه</Hl> — أول حاجة تراجعها.</>)
  const low = r.lowStockProducts[0]
  if (r.lowStockCount > 0 && low)
    extra.push(<><AlertTriangle className="me-1 inline size-[1.05em] -translate-y-0.5 text-amber-500" /><Hl tone="warn">{num(r.lowStockCount)} صنف</Hl> تحت الحد الأدنى — أولهم «{low.name}» {low.quantity === 0 ? 'خلص خالص' : <>فاضل منه {num(low.quantity)}</>}.</>)
  if (hasFinance && (r.customersReceivable > 0 || r.suppliersPayable > 0))
    extra.push(<>ليك عند العملاء <Hl>{num(Math.round(r.customersReceivable))} جنيه</Hl> وعليك للموردين <Hl>{num(Math.round(r.suppliersPayable))} جنيه</Hl>.</>)
  if (ins?.best && ins.best.total > 0 && r.salesTrend.length > 1)
    extra.push(<>أقوى يوم كان <Hl>{shortDate(ins.best.date)}</Hl> بمبيعات <Hl>{num(Math.round(ins.best.total))} جنيه</Hl>.</>)
  if (r.topProducts[0])
    extra.push(<>أكتر منتج جايب إيراد «{r.topProducts[0].name}» بـ <Hl>{num(Math.round(r.topProducts[0].total))} جنيه</Hl>.</>)

  const mAbs = Math.abs(Math.round(netMargin))
  const bubbles: React.ReactNode[] =
    r.salesCount === 0
      ? ['مفيش مبيعات مسجّلة في الفترة دي — جرّب توسّع المدى أو غيّر الفرع.']
      : [
          <>
            المحل باع بـ <Hl>{num(Math.round(r.totalSales))} جنيه</Hl> من <Hl>{num(r.salesCount)} فاتورة</Hl>
            {ch != null && <>، {ch >= 0 ? 'أعلى' : 'أقل'} بـ <Hl tone={ch >= 0 ? 'good' : 'bad'}>{Math.abs(ch).toFixed(0)}٪</Hl> من الفترة اللي فاتت</>}.
          </>,
          loss ? (
            <>
              لكن بعد خصم المصروفات الحساب خسران <Hl tone="bad">{num(Math.round(Math.abs(r.netProfit)))} جنيه</Hl>، يعني بتخسر <Hl tone="bad">{mAbs} جنيه</Hl> من كل 100 جنيه مبيعات
              {(ins?.expRatio ?? 0) > 0 && <>، والمصروفات واخدة {(ins?.expRatio ?? 0).toFixed(0)}٪ من المبيعات</>}.
            </>
          ) : (
            <>
              وبعد خصم المصروفات فضل لك <Hl tone={netMargin < 10 ? 'warn' : 'good'}>{num(Math.round(r.netProfit))} جنيه</Hl> صافي ربح، يعني <Hl tone={netMargin < 10 ? 'warn' : 'good'}>{mAbs} جنيه</Hl> من كل 100 جنيه مبيعات
              {(ins?.expRatio ?? 0) > 0 && <>، والمصروفات واخدة {(ins?.expRatio ?? 0).toFixed(0)}٪ منها</>}.
            </>
          ),
          ...extra.slice(0, 2),
        ]

  const asks = [
    { l: 'أنهي أيام أحسن؟', id: 'ch-rhythm' },
    { l: 'إيه أكتر حاجة بتتباع؟', id: 'ch-leaders' },
    { l: 'المخزون عامل إيه؟', id: 'ch-stock' },
    ...(hasFinance ? [{ l: 'الفلوس رايحة فين؟', id: 'ch-finance' }] : []),
  ]

  return (
    <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -end-10 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="absolute -bottom-28 start-1/3 size-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute top-8 start-0 size-60 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(124,58,237,0.18) 1px, transparent 1.2px)', backgroundSize: '18px 18px', maskImage: 'linear-gradient(to left, black, transparent 55%)', WebkitMaskImage: 'linear-gradient(to left, black, transparent 55%)' }} />
      </div>

      <div className="relative grid gap-4 p-4 sm:gap-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="relative flex size-10 shrink-0 items-center justify-center sm:size-12">
              <span className="absolute inset-0 animate-[ping_1.6s_cubic-bezier(0,0,0.2,1)_3] rounded-full bg-violet-500/30 motion-reduce:hidden" />
              <span className="relative flex size-10 items-center justify-center rounded-full shadow-lg shadow-violet-500/30 sm:size-12" style={{ background: 'conic-gradient(from 180deg, #7c3aed, #d946ef, #06b6d4, #7c3aed)' }}>
                <span className="absolute inset-[3px] rounded-full bg-card/80 backdrop-blur" />
                <Sparkles className="relative size-4 text-violet-600 sm:size-5 dark:text-violet-300" />
              </span>
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold leading-tight sm:text-lg">محلل {shop || 'المحل'}</h1>
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="size-3 shrink-0" />
                <span className="truncate">جهّزت لك ملخص <b className="tabular-nums text-foreground/80">{range}</b> · {branch}</span>
              </p>
            </div>
          </div>

          <div key={`${r.totalSales}-${r.salesCount}-${range}-${branch}`} className="mt-4 space-y-2.5 sm:mt-5">
            {bubbles.map((b, i) => (
              <p
                key={i}
                style={{ animationDelay: `${80 + i * 140}ms` }}
                className="animate-in-up motion-reduce:animate-none w-fit max-w-3xl rounded-2xl rounded-ss-md border bg-background/70 px-3.5 py-2 text-sm font-semibold leading-[1.9] backdrop-blur-sm sm:px-4 sm:py-2.5 sm:text-base sm:leading-[2.1] lg:text-lg"
              >
                {b}
              </p>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
            {asks.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => jump(a.id)}
                style={{ animationDelay: `${80 + (bubbles.length + i) * 90}ms` }}
                className="animate-in-up motion-reduce:animate-none rounded-full border border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-500/15 dark:text-violet-300"
              >
                <span className="inline-flex items-center gap-1.5">
                  {a.l}
                  <ArrowDown className="size-3 opacity-60" />
                </span>
              </button>
            ))}
          </div>
        </div>

        <VerdictCard r={r} netMargin={netMargin} verdict={verdict} />
      </div>
    </section>
  )
}

/* ═════════════════════ مكوّنات الهوية ═════════════════════ */

function VerdictCard({
  r, netMargin, verdict,
}: {
  r: Report
  netMargin: number
  verdict: { t: string; d: string; c: string; tx: string }
}) {
  const has = r.salesCount > 0
  const earned = Math.max(0, r.netProfit + r.totalExpenses)
  const spent = Math.max(0, r.totalExpenses)
  const max = Math.max(earned, spent, 1)
  const clamped = Math.max(-50, Math.min(50, netMargin))
  const pos = clamped + 50
  const m = Math.round(Math.abs(netMargin))
  const netNeg = r.netProfit < 0

  return (
    <aside className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border bg-background/60 p-3.5 backdrop-blur-sm sm:gap-5 sm:p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -end-12 size-36 rounded-full opacity-25 blur-2xl"
        style={{ backgroundColor: verdict.c }}
      />

      <div className="relative">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: verdict.c }} />
          حالة الفترة
        </p>
        <p className={cn('mt-1.5 text-2xl font-black leading-none sm:text-3xl', verdict.tx)}>
          {verdict.t}
        </p>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{verdict.d}</p>
      </div>

      <div className="relative">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">هامش الصافي</span>
          <span dir="ltr" className={cn('text-xl font-extrabold leading-none tabular-nums sm:text-2xl', has && verdict.tx)}>
            {has ? `${netMargin < 0 ? '−' : ''}${m}٪` : '—'}
          </span>
        </div>
        <div dir="ltr" className="relative mt-3 h-2 rounded-full">
          <div className="absolute inset-0 flex overflow-hidden rounded-full opacity-35">
            <span className="h-full bg-rose-500" style={{ width: '50%' }} />
            <span className="h-full bg-amber-500" style={{ width: '10%' }} />
            <span className="h-full bg-emerald-500" style={{ width: '40%' }} />
          </div>
          <span aria-hidden className="absolute -top-1 left-1/2 h-4 w-px bg-foreground/40" />
          <span aria-hidden className="absolute -top-0.5 h-3 w-px bg-foreground/20" style={{ left: '60%' }} />
          {has && (
            <span
              aria-hidden
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-card shadow-md transition-[left] duration-slow ease-out"
              style={{ left: `${pos}%`, borderColor: verdict.c }}
            />
          )}
        </div>
        <div dir="ltr" className="mt-1.5 grid grid-cols-3 text-[10px] text-muted-foreground">
          <span className="text-left">خسارة</span>
          <span className="text-center">0</span>
          <span className="text-right">ربح · 10٪+ صحي</span>
        </div>
      </div>

      {has && (
        <div className="relative space-y-2.5 border-t border-dashed pt-4">
          <FlowBar label="الربح قبل المصروفات" value={earned} max={max} fill={GRAD} />
          <FlowBar label="المصروفات" value={spent} max={max} fill="#f43f5e" />
          <div className="flex items-center justify-between gap-2 border-t pt-2.5">
            <span className="shrink-0 text-xs font-bold">الصافي</span>
            <span dir="ltr" className={cn('min-w-0 break-all text-sm font-extrabold tabular-nums', netNeg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
              {netNeg ? '−' : ''}{num(Math.round(Math.abs(r.netProfit)))} جنيه
            </span>
          </div>
        </div>
      )}
    </aside>
  )
}

function FlowBar({ label, value, max, fill }: { label: string; value: number; max: number; fill: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums">{num(Math.round(value))}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-slow ease-out"
          style={{ width: `${Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%`, background: fill }}
        />
      </div>
    </div>
  )
}

type ChapterItem = { id: string; n: string; label: string; note: string; tone: 'ok' | 'warn' | 'bad' | 'info' }
const TONE_DOT = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500', info: 'bg-violet-500' } as const

function ChapterMap({ chapters, active }: { chapters: ChapterItem[]; active: string }) {
  const [m, setM] = React.useState<{ p: number[]; h: number[]; all: number }>({ p: [], h: [], all: 0 })
  const key = chapters.map((c) => c.id).join()

  React.useEffect(() => {
    let raf = 0
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
    const calc = () => {
      raf = 0
      const anchor = window.innerHeight * 0.3
      const rects = key.split(',').map((id) => document.getElementById(id)?.getBoundingClientRect() ?? null)
      const p = rects.map((r) => (r ? Math.round(clamp01((anchor - r.top) / Math.max(1, r.height)) * 100) : 0))
      const h = rects.map((r) => (r ? Math.round(r.height) : 0))
      const first = rects.find(Boolean)
      const last = [...rects].reverse().find(Boolean)
      const all = first && last ? Math.round(clamp01((anchor - first.top) / Math.max(1, last.bottom - first.top)) * 100) : 0
      setM((prev) => (prev.all === all && prev.p.join() === p.join() && prev.h.join() === h.join() ? prev : { p, h, all }))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    const t = window.setTimeout(calc, 500)
    document.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => {
      clearTimeout(t)
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('scroll', on, true)
      window.removeEventListener('resize', on)
    }
  }, [key])

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const sumH = m.h.reduce((a, b) => a + b, 0)
  const seg = (i: number) => (sumH > 0 && m.h[i] ? Math.max(52, (m.h[i] / sumH) * 240) : 64)

  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:hidden" role="group" aria-label="فصول التقرير">
        {chapters.map((c, i) => {
          const on = active === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => jump(c.id)}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'relative shrink-0 overflow-hidden rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                on ? 'border-violet-500/40 bg-violet-500/10 text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="relative flex items-center gap-1.5 whitespace-nowrap">
                <span dir="ltr" className={cn('font-black tabular-nums', on ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/50')}>{c.n}</span>
                {c.label}
              </span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
                <span className="block h-full transition-[width] duration-base" style={{ width: `${m.p[i] ?? 0}%`, background: GRAD }} />
              </span>
            </button>
          )
        })}
      </div>

      <nav className="hidden lg:block" aria-label="خريطة التقرير">
        <div className="mb-3 flex items-baseline justify-between px-2">
          <span className="text-[11px] font-extrabold">خريطة التقرير</span>
          <span dir="ltr" className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-violet-700 dark:text-violet-300" title="نسبة اللي وصلت له من التقرير">
            {m.all}٪
          </span>
        </div>

        <ol className="space-y-1">
          {chapters.map((c, i) => {
            const on = active === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => jump(c.id)}
                  aria-current={on ? 'true' : undefined}
                  className={cn('group flex w-full gap-3 rounded-xl p-2 text-start transition-colors', on ? 'bg-violet-500/[0.07]' : 'hover:bg-muted/50')}
                >
                  <span aria-hidden className="relative w-1.5 shrink-0 overflow-hidden rounded-full bg-muted" style={{ minHeight: seg(i) }}>
                    <span className="absolute inset-x-0 top-0 rounded-full transition-[height] duration-base ease-out" style={{ height: `${m.p[i] ?? 0}%`, background: `linear-gradient(to bottom, ${V}, ${F})` }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span dir="ltr" className={cn('text-xs font-black tabular-nums', on ? 'bg-clip-text text-transparent' : 'text-muted-foreground/50')} style={on ? { backgroundImage: GRAD } : undefined}>{c.n}</span>
                      <span className={cn('text-xs font-bold transition-colors', on ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{c.label}</span>
                    </span>
                    <span className={cn('grid transition-[grid-template-rows,opacity] duration-base ease-out', on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                      <span className="overflow-hidden">
                        <span className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-snug text-muted-foreground">
                          <i className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[c.tone])} />
                          <span className="truncate">{c.note}</span>
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <button
          type="button"
          onClick={() => document.getElementById('rpt-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="mt-2 flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUp className="size-3" />
          لأول التقرير
        </button>
      </nav>
    </div>
  )
}

const HL_TONES = {
  neutral: 'from-violet-500/20 to-fuchsia-500/20',
  good: 'from-emerald-500/25 to-emerald-500/10',
  bad: 'from-rose-500/25 to-rose-500/10',
  warn: 'from-amber-500/30 to-amber-500/10',
} as const

function Hl({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: keyof typeof HL_TONES }) {
  return <span className={cn('box-decoration-clone rounded-lg bg-gradient-to-l px-1.5 py-0.5 font-extrabold text-foreground', HL_TONES[tone])}>{children}</span>
}

function Chapter({ id, n, title, hint, children }: { id: string; n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    // ⚡ v9: .cv-heavy (globals.css) — الأقسام بره الشاشة ما بتتكلفش رسم/حساب
    // (الرسوم SVG ثقيلة) وأي دايلوج يفتح فوق الصفحة بيدفع recalc أقل بكثير.
    // getBoundingClientRect بتاع ChapterMap شغال عادي لأن c-v بيحافظ على الصندوق.
    <section id={id} className="cv-heavy animate-in-up scroll-mt-24 space-y-4">
      <div className="flex items-end gap-2 sm:gap-3">
        <span dir="ltr" className="bg-clip-text text-3xl font-black leading-none tabular-nums text-transparent sm:text-5xl" style={{ backgroundImage: `linear-gradient(to bottom, ${V}, ${F})` }}>{n}</span>
        <div className="min-w-0 flex-1 pb-0.5">
          <h2 className="truncate text-base font-extrabold leading-tight sm:text-lg">{title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="mb-2 hidden h-px flex-1 bg-border sm:block" />
      </div>
      {children}
    </section>
  )
}

function Panel({ title, hint, className, children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-3xl border bg-card p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-extrabold">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

const Empty = ({ t, ok }: { t: string; ok?: boolean }) => (
  <div className="flex flex-col items-center gap-2 py-8 text-center">
    <span className={cn('flex size-10 items-center justify-center rounded-2xl', ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
      {ok ? <CheckCircle2 className="size-5" /> : <Inbox className="size-5" />}
    </span>
    <p className="text-sm text-muted-foreground">{t}</p>
  </div>
)

function Seg<T extends string>({
  value, onChange, options, label, className,
}: {
  value: T | null
  onChange: (v: T) => void
  options: { v: T; l: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex w-full max-w-full flex-wrap gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-inset ring-border/60 sm:inline-flex sm:w-auto sm:flex-nowrap sm:overflow-x-auto', className)}>
      {options.map((o) => {
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-base ease-out',
              on
                ? 'bg-card text-violet-700 shadow-sm ring-1 ring-violet-500/20 dark:text-violet-300'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: number; tone?: 'pos' | 'neg' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 font-bold tabular-nums', tone === 'pos' && 'text-emerald-600 dark:text-emerald-400', tone === 'neg' && 'text-rose-600 dark:text-rose-400')}>{formatCurrency(value)}</span>
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
          <li key={m.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 font-medium"><i className="size-2.5 shrink-0 rounded-full" style={{ background: MIX[i % MIX.length] }} /><span className="truncate">{m.label}</span></span>
            <span className="shrink-0 tabular-nums text-muted-foreground"><b className="text-foreground">{formatCurrency(m.value)}</b> · {pct(m.value, total).toFixed(0)}٪</span>
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

function Ring({ p, color, className }: { p: number; color: string; className?: string }) {
  const R = 15
  const C = 2 * Math.PI * R
  const c = Math.max(0, Math.min(100, p))
  return (
    <svg viewBox="0 0 40 40" className={cn('-rotate-90', className ?? 'size-12')}>
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
      {Math.abs(v).toFixed(0)}٪
    </span>
  )
}

function Signal({ label, value, unit, delta, children }: { label: string; value: string; unit?: string; delta?: number | null; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card p-3.5 sm:p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 flex min-w-0 items-baseline gap-1">
            <span
              dir="ltr"
              style={{ unicodeBidi: 'isolate' }}
              className="min-w-0 truncate text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl"
            >
              {value}
            </span>
            {unit && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{unit}</span>}
          </p>
          {delta != null && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Delta v={delta} />
              <span className="text-[10px] text-muted-foreground">عن السابقة</span>
            </div>
          )}
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
          {p.dataKey === 'total' ? 'المبيعات' : r.canViewProfits !== false ? 'الربح' : ''}
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
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-0 sm:p-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold sm:text-base">منحنى المبيعات والربح</h2>
          <p className="truncate text-[11px] text-muted-foreground">يوم بيوم — مرّر على الرسم لتفاصيل اليوم</p>
        </div>
        <Seg<'both' | 'total' | 'profit'>
          label="نوع المنحنى"
          value={m}
          onChange={setM}
          options={[{ v: 'both', l: 'الاثنين' }, { v: 'total', l: 'المبيعات' }, ...(r.canViewProfits !== false ? [{ v: 'profit' as const, l: 'الربح' }] : [])]}
        />
      </div>

      <div dir="ltr" className="h-60 px-1 pt-3 sm:h-72 sm:px-2 sm:pt-4">
        {t.length > 1 ? (
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
              {r.canViewProfits !== false && m !== 'total' && <Area type="monotone" dataKey="profit" stroke={F} strokeWidth={2.5} fill="url(#rpt-gf)" />}
            </AreaChart>
          </ResponsiveContainer>
        ) : t.length === 1 ? (
          <div dir="rtl" className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-xs text-muted-foreground">يوم واحد في الفترة · {shortDate(t[0].date)}</p>
            <p className="min-w-0 break-all text-3xl font-extrabold tabular-nums tracking-tight sm:text-5xl">{formatCurrency(t[0].total)}</p>
            {r.canViewProfits !== false && <p className="text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-400">ربح {formatCurrency(t[0].profit ?? 0)}</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">وسّع المدى (أسبوع / شهر) علشان يظهر المنحنى</p>
          </div>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">لا توجد مبيعات في هذه الفترة</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Signal label="إجمالي المبيعات" value={num(Math.round(r.totalSales))} unit="جنيه" delta={r.changes.totalSales}>
          <div className="w-16 sm:w-20"><Spark v={t.map((x) => x.total)} /></div>
        </Signal>
        {r.canViewProfits !== false && <Signal label="صافي الربح" value={num(Math.round(r.netProfit ?? 0))} unit="جنيه" delta={r.changes.netProfit}>
          <div className="relative">
            <Ring className="size-12 sm:size-14" p={Math.abs(ins?.netMargin ?? 0)} color={(ins?.netMargin ?? 0) >= 0 ? V : '#f43f5e'} />
            <span dir="ltr" className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums">{(ins?.netMargin ?? 0) < 0 ? '−' : ''}{Math.abs(Math.round(ins?.netMargin ?? 0))}٪</span>
          </div>
        </Signal>}
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
      <div className="relative mt-4 h-44 sm:mt-6 sm:h-52">
        <div className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${at(0)}%` }} />
        <div className="absolute inset-0 flex gap-1.5 sm:gap-3">
          {bars.map((b, i) => {
            const color = b.total ? (b.end >= 0 ? GRAD : '#f43f5e') : b.v >= 0 ? '#10b981' : '#f43f5e'
            return (
              <div key={i} className="relative h-full flex-1">
                <div
                  className="absolute inset-x-1 rounded-lg transition-all duration-slow ease-out sm:inset-x-3 md:inset-x-6"
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
      <div className="mt-2 flex gap-1.5 border-t pt-2 sm:gap-3">
        {bars.map((b, i) => (
          <span key={i} className={cn('min-w-0 flex-1 truncate text-center text-[10px] sm:text-[11px]', b.total ? 'font-extrabold' : 'text-muted-foreground')}>{b.label}</span>
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