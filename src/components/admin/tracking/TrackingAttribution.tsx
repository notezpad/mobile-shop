'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Download, RefreshCw, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Users, CreditCard, Wallet, FlaskConical, Globe, Infinity as MetaIcon, Instagram, Music2, MessageCircle, Mail, Send, AlertCircle } from 'lucide-react'
import { FilterBar, type RangeFilterState, initialRange, rangeParams, fetchJson, fmtNum, fmtPct100, fmtMoney, DataIssueBanner } from './shared'
import './attribution-report.css'

interface AttributionRow {
  source: string
  medium: string
  campaign: string
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  trialToPaid: number | null
  revenue: number
}
interface AttributionPayload { rows: AttributionRow[]; dataReady?: boolean; errorDetail?: string }
type SortKey = 'purchases' | 'revenue' | 'trials' | 'conversion' | 'registrations'
type BrandKey = 'direct' | 'google' | 'meta' | 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'email' | 'telegram' | 'other'
const PAGE_SIZE = 10
const SORT_LABELS: Record<SortKey, string> = { purchases: 'الاشتراكات المدفوعة', revenue: 'الإيرادات', trials: 'التجارب المجانية', conversion: 'التحويل من تجربة إلى اشتراك', registrations: 'التسجيلات' }
const DIRECT_VALUES = new Set(['(مباشر)', 'مباشر', 'direct', '(direct)'])
const MISSING_VALUES = new Set(['', '—', '-', '(none)', 'none', '(not set)', 'null'])
const SOURCE_NAMES: Record<string, { label: string; brand: BrandKey }> = {
  google: { label: 'Google', brand: 'google' }, google_ads: { label: 'Google Ads', brand: 'google' }, googleads: { label: 'Google Ads', brand: 'google' }, adwords: { label: 'Google Ads', brand: 'google' },
  meta: { label: 'Meta', brand: 'meta' }, facebook: { label: 'Facebook', brand: 'facebook' }, fb: { label: 'Facebook', brand: 'facebook' },
  instagram: { label: 'Instagram', brand: 'instagram' }, ig: { label: 'Instagram', brand: 'instagram' },
  tiktok: { label: 'TikTok', brand: 'tiktok' }, tik_tok: { label: 'TikTok', brand: 'tiktok' },
  whatsapp: { label: 'WhatsApp', brand: 'whatsapp' }, wa: { label: 'WhatsApp', brand: 'whatsapp' },
  newsletter: { label: 'النشرة البريدية', brand: 'email' }, email: { label: 'البريد الإلكتروني', brand: 'email' }, telegram: { label: 'Telegram', brand: 'telegram' },
}
const MEDIUM_NAMES: Record<string, string> = { cpc: 'إعلانات بالنقرة', ppc: 'إعلانات بالنقرة', paid_search: 'بحث مدفوع', paid_social: 'إعلانات اجتماعية', paid_social_video: 'إعلانات فيديو', paid_social_story: 'إعلانات القصص', display: 'إعلانات عرض', shopping: 'إعلانات تسوّق', organic: 'وصول عضوي', organic_search: 'بحث عضوي', social: 'تواصل اجتماعي', referral: 'إحالة من موقع', email: 'بريد إلكتروني', video: 'فيديو', youtube: 'فيديو يوتيوب' }
const PAID_MEDIA = new Set(['cpc', 'ppc', 'paid_search', 'paid_social', 'paid_social_video', 'paid_social_story', 'display', 'shopping'])
function sourceIdentity(source: string) {
  const key = source.trim().toLowerCase()
  if (DIRECT_VALUES.has(key)) return { label: 'زيارة مباشرة', brand: 'direct' as BrandKey }
  if (MISSING_VALUES.has(key) || key === 'unknown') return { label: 'مصدر غير محدد', brand: 'other' as BrandKey }
  return SOURCE_NAMES[key] ?? { label: source, brand: 'other' as BrandKey }
}
function mediumLabel(medium: string) {
  const key = medium.trim().toLowerCase()
  return MISSING_VALUES.has(key) ? 'غير محددة' : (MEDIUM_NAMES[key] ?? medium)
}
function campaignLabel(campaign: string) { return MISSING_VALUES.has(campaign.trim().toLowerCase()) ? 'بدون حملة' : campaign }
function BrandMark({ brand }: { brand: BrandKey }) {
  const icons = { direct: Globe, meta: MetaIcon, instagram: Instagram, tiktok: Music2, whatsapp: MessageCircle, email: Mail, telegram: Send, other: Globe }
  const Icon = brand !== 'facebook' && brand !== 'google' ? icons[brand] : null
  return <span className="report-brand" data-brand={brand} aria-hidden="true">{brand === 'google' ? <span className="report-google">G</span> : brand === 'facebook' ? 'f' : Icon ? <Icon /> : null}</span>
}
/** كارت المصدر للجوال — بديل الجدول تحت 768px */
function SourceCard({ r }: { r: AttributionRow }) {
  const identity = sourceIdentity(r.source)
  const direct = identity.brand === 'direct'
  const channel = direct && MISSING_VALUES.has(r.medium.trim().toLowerCase()) ? 'وصول مباشر' : mediumLabel(r.medium)
  const campaign = campaignLabel(r.campaign)
  const noCampaign = campaign === 'بدون حملة'
  const metrics = [
    { label: 'التسجيلات', value: r.registrations, strong: false },
    { label: 'التجارب', value: r.trials, strong: false },
    { label: 'بدء الدفع', value: r.checkouts, strong: false },
    { label: 'الاشتراكات', value: r.purchases, strong: r.purchases > 0 },
  ]
  return (
    <li className="report-card">
      <div className="report-card-head">
        <div className="report-source">
          <BrandMark brand={identity.brand} />
          <div className="min-w-0">
            <div className="report-source-name" title={identity.label}>{identity.label}</div>
            <div className="report-source-raw" title={r.source} dir={direct ? 'rtl' : 'ltr'}>{direct ? 'بدون مصدر إحالة' : r.source}</div>
          </div>
        </div>
        <span className="report-channel" data-paid={PAID_MEDIA.has(r.medium.trim().toLowerCase())} title={r.medium}>{channel}</span>
      </div>
      <div className="report-card-campaign">
        <span>الحملة</span>
        <b dir={noCampaign ? 'rtl' : 'ltr'} title={r.campaign}>{campaign}</b>
      </div>
      <dl className="report-card-metrics">
        {metrics.map((m) => (
          <div key={m.label} data-strong={m.strong ? 'true' : undefined}>
            <dt>{m.label}</dt>
            <dd>{fmtNum(m.value)}</dd>
          </div>
        ))}
      </dl>
      <div className="report-card-foot">
        <div className="report-card-conv">
          <span>تجربة ← اشتراك</span>
          <div className="report-conversion-inline">
            <span dir="ltr">{fmtPct100(r.trialToPaid)}</span>
            {r.trialToPaid !== null && <progress max={100} value={Math.max(0, Math.min(100, r.trialToPaid))} aria-label={`التحويل من تجربة إلى اشتراك: ${fmtPct100(r.trialToPaid)}`} />}
          </div>
        </div>
        <div className="report-card-revenue">
          <span>الإيرادات</span>
          <b>{fmtMoney(r.revenue)}</b>
        </div>
      </div>
    </li>
  )
}
function SortHead({ column, sortBy, order, onSort, children, className = 'report-number-col' }: { column: SortKey; sortBy: SortKey; order: 'asc' | 'desc'; onSort: (key: SortKey) => void; children: React.ReactNode; className?: string }) {
  const active = column === sortBy
  const Icon = active ? (order === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown
  return <TableHead scope="col" className={className} aria-sort={active ? (order === 'desc' ? 'descending' : 'ascending') : 'none'}><Button type="button" variant="ghost" className="report-sort h-auto gap-1 whitespace-normal px-1.5 py-1 text-[12px] font-bold leading-tight hover:bg-transparent" data-active={active} onClick={() => onSort(column)} aria-label={`ترتيب حسب ${SORT_LABELS[column]}`} title={SORT_LABELS[column]}><span>{children}</span><Icon className="size-3 shrink-0" /></Button></TableHead>
}

export function TrackingAttribution() {
  const [filters, setFilters] = React.useState<RangeFilterState>(initialRange)
  const [sortBy, setSortBy] = React.useState<SortKey>('purchases')
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc')
  const [rows, setRows] = React.useState<AttributionRow[] | null>(null)
  const [issue, setIssue] = React.useState<{ dataReady?: boolean; errorDetail?: string } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const requestId = React.useRef(0)
  const load = React.useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const qs = rangeParams(filters)
      qs.set('sortBy', sortBy)
      qs.set('order', order)
      const res = await fetchJson<AttributionPayload>(`/api/admin/tracking/attribution?${qs.toString()}`)
      if (id !== requestId.current) return
      setRows(Array.isArray(res.rows) ? res.rows : [])
      setIssue({ ...(res.dataReady === undefined ? {} : { dataReady: res.dataReady }), ...(res.errorDetail === undefined ? {} : { errorDetail: res.errorDetail }) })
    } catch (e: unknown) {
      if (id !== requestId.current) return
      setRows(null)
      setIssue(null)
      setError(e instanceof Error ? e.message : 'تعذّر تحميل تقرير المصادر')
    } finally { if (id === requestId.current) setLoading(false) }
  }, [filters, sortBy, order])
  React.useEffect(() => { void load(); return () => { requestId.current += 1 } }, [load])
  const changeFilters = (next: RangeFilterState) => { setPage(1); setRows(null); setFilters(next) }
  const changeSort = (key: SortKey) => { setPage(1); setSortBy(key); setOrder(sortBy === key ? (order === 'desc' ? 'asc' : 'desc') : 'desc') }
  const visibleRows = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return (rows ?? []).filter((row) => !query || [row.source, row.medium, row.campaign, sourceIdentity(row.source).label, mediumLabel(row.medium), campaignLabel(row.campaign)].some((value) => value.toLowerCase().includes(query))).sort((a, b) => {
      const av = sortBy === 'conversion' ? a.trialToPaid : a[sortBy]
      const bv = sortBy === 'conversion' ? b.trialToPaid : b[sortBy]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return order === 'desc' ? bv - av : av - bv
    })
  }, [rows, search, sortBy, order])
  const totals = React.useMemo(() => (rows ?? []).reduce((sum, row) => ({ registrations: sum.registrations + row.registrations, trials: sum.trials + row.trials, purchases: sum.purchases + row.purchases, revenue: sum.revenue + row.revenue }), { registrations: 0, trials: 0, purchases: 0, revenue: 0 }), [rows])
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageRows = visibleRows.slice(start, start + PAGE_SIZE)
  const unavailable = loading || Boolean(error) || issue?.dataReady === false
  const exportCsv = () => {
    if (unavailable || !visibleRows.length) return
    const headers = ['المصدر', 'قناة الوصول', 'الحملة', 'التسجيلات', 'التجارب المجانية', 'بدء الدفع', 'الاشتراكات المدفوعة', 'التحويل من تجربة إلى اشتراك (%)', 'الإيرادات (ج.م)']
    const escape = (value: string | number | null) => {
      let text = value == null ? '' : String(value)
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
      return `"${text.replace(/"/g, '""')}"`
    }
    const lines = [headers, ...visibleRows.map((r) => [sourceIdentity(r.source).label, mediumLabel(r.medium), campaignLabel(r.campaign), r.registrations, r.trials, r.checkouts, r.purchases, r.trialToPaid, r.revenue])]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map((r) => r.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = `source-report-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const stats = [
    { label: 'التسجيلات', value: fmtNum(totals.registrations), hint: 'حسابات جديدة', icon: Users },
    { label: 'التجارب المجانية', value: fmtNum(totals.trials), hint: 'تجارب بدأت خلال الفترة', icon: FlaskConical },
    { label: 'الاشتراكات المدفوعة', value: fmtNum(totals.purchases), hint: 'عمليات شراء مؤكدة', icon: CreditCard },
    { label: 'إجمالي الإيرادات', value: fmtNum(totals.revenue), unit: 'ج.م', hint: 'المبالغ المدفوعة فعليًا', icon: Wallet, tone: 'positive' },
  ]
  return (
    <section className="source-report" dir="rtl" aria-label="تقارير المصادر">
      <h2 className="sr-only">تقارير المصادر</h2>
      <div className="report-top">
        <div className="report-filter-band"><FilterBar value={filters} onChange={changeFilters} /></div>
        <div className="report-actions">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} aria-label="تحديث التقرير" title="تحديث التقرير"><RefreshCw className={loading ? 'report-loading' : ''} /><span className="report-action-label">تحديث</span></Button>
          <Button type="button" onClick={exportCsv} disabled={unavailable || !visibleRows.length} aria-label="تصدير التقرير CSV" title="تصدير التقرير CSV"><Download /><span className="report-action-label">تصدير CSV</span></Button>
        </div>
      </div>
      {issue?.dataReady === false && <DataIssueBanner {...(issue.errorDetail === undefined ? {} : { errorDetail: issue.errorDetail })} />}
      {!unavailable && rows !== null && rows.length > 0 && totals.purchases === 0 && totals.revenue === 0 && (
        <p className="report-hint" role="status">
          <span aria-hidden="true">✓</span>
          التتبع يعمل — سُجّل {fmtNum(totals.registrations)} حساب و{fmtNum(totals.trials)} تجربة خلال الفترة، ولا توجد اشتراكات مدفوعة بعد، لذلك الإيرادات صفر.
        </p>
      )}
      <div className="report-kpis">{stats.map((stat) => <div key={stat.label} className="report-kpi" data-tone={stat.tone}><div className="report-kpi-label"><stat.icon /><span>{stat.label}</span></div><strong>{unavailable || rows === null ? '—' : <>{stat.value}{'unit' in stat && stat.unit ? <span className="report-unit">{stat.unit}</span> : null}</>}</strong><small>{stat.hint}</small></div>)}</div>
      <div className="report-workspace" aria-busy={loading}>
        <div className="report-toolbar">
          <div className="min-w-0"><h3 className="text-sm font-bold">المصادر والحملات <span className="report-count">{rows && !unavailable ? `${fmtNum(visibleRows.length)} مصدر / حملة` : ''}</span></h3></div>
          <div className="report-search"><Search aria-hidden="true" /><Input className="h-10 rounded-lg ps-10 text-base md:text-sm" aria-label="بحث في المصادر والحملات" placeholder="ابحث عن مصدر أو حملة…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></div>
          <div className="report-sortbar md:hidden">
            <span>ترتيب حسب</span>
            <Select value={sortBy} onValueChange={(v) => { setPage(1); setSortBy(v as SortKey) }}>
              <SelectTrigger className="h-10 min-w-0 flex-1 gap-2 rounded-lg text-xs" dir="rtl" aria-label="ترتيب التقرير حسب">
                <SelectValue className="min-w-0 truncate">{SORT_LABELS[sortBy]}</SelectValue>
              </SelectTrigger>
              <SelectContent dir="rtl">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" className="size-10 shrink-0 rounded-lg" aria-label={order === 'desc' ? 'ترتيب تنازلي — اضغط للتصاعدي' : 'ترتيب تصاعدي — اضغط للتنازلي'} title={order === 'desc' ? 'تنازلي' : 'تصاعدي'} onClick={() => { setPage(1); setOrder(order === 'desc' ? 'asc' : 'desc') }}>
              {order === 'desc' ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
            </Button>
          </div>
        </div>
        {loading ? <div className="report-skeleton" role="status" aria-label="جارٍ تحميل التقرير">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : error ? <div className="report-state" role="alert"><AlertCircle /><h3>تعذّر تحميل التقرير</h3><p>{error}</p><Button variant="outline" onClick={() => void load()}><RefreshCw />إعادة المحاولة</Button></div> : issue?.dataReady === false ? <div className="report-state"><AlertCircle /><h3>بيانات التقرير غير متاحة حاليًا</h3><Button variant="outline" onClick={() => void load()}><RefreshCw />إعادة المحاولة</Button></div> : !visibleRows.length ? <div className="report-state"><Search /><h3>{search ? 'لا توجد نتائج مطابقة' : 'لا توجد بيانات في هذه الفترة'}</h3><p>{search ? 'جرّب اسم مصدر أو حملة أخرى.' : 'لم تُسجّل تحويلات بالمصادر والفلاتر المحددة.'}</p>{search ? <Button variant="outline" onClick={() => { setSearch(''); setPage(1) }}>مسح البحث</Button> : <Button variant="outline" onClick={() => changeFilters({ ...initialRange })}>إعادة ضبط الفلاتر</Button>}</div> : <>
          <div className="md:hidden"><ul className="report-cards" aria-label="أداء المصادر والحملات">{pageRows.map((r, i) => <SourceCard key={`${r.source}|${r.medium}|${r.campaign}|${start + i}`} r={r} />)}</ul></div>
          <div className="hidden md:block"><Table aria-label="أداء المصادر والحملات">
          <TableHeader><TableRow>
            <TableHead scope="col" className="report-source-col">المصدر</TableHead><TableHead scope="col" className="report-medium-col">قناة الوصول</TableHead><TableHead scope="col" className="report-campaign-col">الحملة</TableHead>
            <SortHead column="registrations" {...{ sortBy, order }} onSort={changeSort}>التسجيلات</SortHead><SortHead column="trials" {...{ sortBy, order }} onSort={changeSort}>التجارب</SortHead><TableHead scope="col" className="report-number-col">بدء الدفع</TableHead><SortHead column="purchases" {...{ sortBy, order }} onSort={changeSort}>الاشتراكات</SortHead><SortHead column="conversion" {...{ sortBy, order }} onSort={changeSort} className="report-conv-col">تجربة ← اشتراك</SortHead><SortHead column="revenue" {...{ sortBy, order }} onSort={changeSort} className="report-revenue-col">الإيرادات</SortHead>
          </TableRow></TableHeader>
          <TableBody>{pageRows.map((r, i) => {
            const identity = sourceIdentity(r.source)
            const direct = identity.brand === 'direct'
            const channel = direct && MISSING_VALUES.has(r.medium.trim().toLowerCase()) ? 'وصول مباشر' : mediumLabel(r.medium)
            return <TableRow key={`${r.source}|${r.medium}|${r.campaign}|${start + i}`}>
              <TableCell className="report-source-col"><div className="report-source"><BrandMark brand={identity.brand} /><div className="min-w-0"><div className="report-source-name" title={identity.label}>{identity.label}</div><div className="report-source-raw" title={r.source} dir={direct ? 'rtl' : 'ltr'}>{direct ? 'بدون مصدر إحالة' : r.source}</div></div></div></TableCell>
              <TableCell><span className="report-channel" data-paid={PAID_MEDIA.has(r.medium.trim().toLowerCase())} title={r.medium}>{channel}</span></TableCell>
              <TableCell><div className="report-campaign" dir={campaignLabel(r.campaign) === 'بدون حملة' ? 'rtl' : 'ltr'} title={r.campaign}>{campaignLabel(r.campaign)}</div></TableCell>
              <TableCell className="report-number-col">{fmtNum(r.registrations)}</TableCell><TableCell className="report-number-col">{fmtNum(r.trials)}</TableCell><TableCell className="report-number-col">{fmtNum(r.checkouts)}</TableCell><TableCell className={`report-number-col ${r.purchases > 0 ? 'report-purchases' : ''}`}>{fmtNum(r.purchases)}</TableCell>
              <TableCell className="report-conv-col"><div className="report-conversion"><span dir="ltr">{fmtPct100(r.trialToPaid)}</span>{r.trialToPaid !== null && <progress max={100} value={Math.max(0, Math.min(100, r.trialToPaid))} aria-label={`التحويل من تجربة إلى اشتراك: ${fmtPct100(r.trialToPaid)}`} />}</div></TableCell><TableCell className="report-revenue-col font-bold">{fmtMoney(r.revenue)}</TableCell>
            </TableRow>
          })}</TableBody>
        </Table></div></>}
        {!loading && !error && issue?.dataReady !== false && visibleRows.length > 0 && <footer className="report-footer"><span>عرض {fmtNum(start + 1)}–{fmtNum(Math.min(start + PAGE_SIZE, visibleRows.length))} من {fmtNum(visibleRows.length)} نتيجة</span><div className="report-pagination"><Button type="button" variant="outline" size="icon" aria-label="الصفحة السابقة" title="الصفحة السابقة" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronRight /></Button><span aria-live="polite">{fmtNum(currentPage)} / {fmtNum(pageCount)}</span><Button type="button" variant="outline" size="icon" aria-label="الصفحة التالية" title="الصفحة التالية" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronLeft /></Button></div></footer>}
      </div>
      <p className="report-note">{filters.model === 'first' ? 'الإسناد لأول مصدر وصل منه العميل.' : 'الإسناد لآخر مصدر قبل التحويل.'} التحويل: من تجربة مجانية إلى اشتراك مدفوع. الإيرادات: المدفوع فعليًا للاشتراكات المرتبطة بعمليات شراء مؤكدة.</p>
    </section>
  )
}