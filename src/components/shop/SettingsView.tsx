'use client'

import * as React from 'react'
import {
  ImagePlus, Loader2, Save, Sparkles, CalendarDays, CheckCircle2, Printer, Bell,
  SlidersHorizontal, Store, Receipt, BadgeCheck, Percent, Calculator, Undo2, Clock,
} from 'lucide-react'
import { PrinterSettingsDialog } from './PrinterSettingsDialog'
import { RedeemCodeCard } from './RedeemCodeCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { formatCurrency, formatNumber } from '@/lib/format'
import { useDataRefresh } from '@/lib/offline/data-events'
import { Panel, Led, Toggle, SettingRow, Field, INK_FIELD, INK_BTN, INK_BTN_OUTLINE } from './settings-ui'

interface TenantData {
  id: string
  shopName: string
  phone: string | null
  address: string | null
  logoPath: string | null
  invoicePrefix: string
  timezone: string
  commissionVodafoneCash: number
  commissionInstapay: number
  commissionFawry: number
  retailEnabled: boolean
  dynamicRetailPricingEnabled: boolean
  defaultRetailMarginPercent: number
}

interface SubInfo {
  planName: string
  planCode: string
  period: string
  endDate: string
  daysLeft: number | null
  expired: boolean
  expiringSoon: boolean
}

// بلاد التشغيل الحالية/المحتملة للمحلات — القائمة دي بس اقتراحات سريعة
// في الواجهة؛ أي IANA timezone صحيح مقبول فعليًا لو اتبعت مباشرة للـ API.
const TIMEZONE_OPTIONS = [
  { value: 'Africa/Cairo', label: 'القاهرة (مصر)' },
  { value: 'Asia/Riyadh', label: 'الرياض (السعودية)' },
  { value: 'Asia/Dubai', label: 'دبي (الإمارات)' },
  { value: 'Asia/Kuwait', label: 'الكويت' },
  { value: 'Asia/Qatar', label: 'الدوحة (قطر)' },
  { value: 'Asia/Bahrain', label: 'المنامة (البحرين)' },
  { value: 'Asia/Amman', label: 'عمّان (الأردن)' },
  { value: 'Asia/Beirut', label: 'بيروت (لبنان)' },
  { value: 'Asia/Baghdad', label: 'بغداد (العراق)' },
  { value: 'Africa/Casablanca', label: 'الدار البيضاء (المغرب)' },
  { value: 'Africa/Tunis', label: 'تونس' },
  { value: 'Africa/Algiers', label: 'الجزائر' },
  { value: 'Europe/London', label: 'لندن (بريطانيا)' },
  { value: 'Europe/Istanbul', label: 'إسطنبول (تركيا)' },
  { value: 'America/New_York', label: 'نيويورك (أمريكا)' },
]

// الحقول اللي بتتحفظ بزر «حفظ» (وبنتتبّع تغييراتها) + اسمها في شريط التغييرات
const TRACKED: { key: keyof TenantData; label: string }[] = [
  { key: 'logoPath', label: 'الشعار' },
  { key: 'shopName', label: 'اسم المحل' },
  { key: 'phone', label: 'التليفون' },
  { key: 'address', label: 'العنوان' },
  { key: 'invoicePrefix', label: 'بادئة الفواتير' },
  { key: 'timezone', label: 'المنطقة الزمنية' },
  { key: 'commissionVodafoneCash', label: 'عمولة المحافظ' },
  { key: 'commissionInstapay', label: 'عمولة انستاباي' },
  { key: 'commissionFawry', label: 'عمولة فوري' },
  { key: 'dynamicRetailPricingEnabled', label: 'التسعير التلقائي' },
  { key: 'defaultRetailMarginPercent', label: 'هامش الربح' },
]

// أسماء الموديولات زي ما بتظهر في القائمة الجانبية (settings مش بنعرضها لأنها دايماً موجودة)
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'لوحة المعلومات', pos: 'نقطة البيع', products: 'المنتجات', sales: 'سجل المبيعات',
  maintenance: 'الصيانة', customers: 'العملاء', suppliers: 'الموردين', purchases: 'المشتريات',
  inventory: 'المخزون', finance: 'المعاملات المالية', expenses: 'المصروفات', cash: 'الخزنة',
  reports: 'التقارير', branches: 'الفروع', users: 'المستخدمين',
}

function fmtTz(d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, ...opts }).format(d)
  } catch {
    return '—'
  }
}

/** ساعة حيّة بتحدّث نفسها كل ١٥ ثانية */
function useNow() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** حقل رقمي بيحتفظ بنص الكتابة (عشان تكتب 0.5 من غير ما يتحوّل لـ 0) — الرقم في النص والعلامة على الطرف */
function NumInput({
  value, onChange, suffix, min = 0, disabled,
}: {
  value: number
  onChange: (n: number) => void
  suffix?: string
  min?: number
  disabled?: boolean
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => {
    if ((parseFloat(text) || 0) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div dir="ltr" className="relative">
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        step="0.1"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseFloat(e.target.value)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        className={cn(INK_FIELD, 'px-9 text-center text-base font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-extrabold text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function SettingsView() {
  const [data, setData] = React.useState<TenantData | null>(null)
  const [saved, setSaved] = React.useState<TenantData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [printerDialogOpen, setPrinterDialogOpen] = React.useState(false)
  const [sampleAmount, setSampleAmount] = React.useState(1000)
  const now = useNow()

  // Subscription info — loaded separately from /api/subscription
  const [sub, setSub] = React.useState<SubInfo | null>(null)
  const [subLoading, setSubLoading] = React.useState(true)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const setPlan = useShopStore((s) => s.setPlan)
  const setSubscription = useShopStore((s) => s.setSubscription)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')

  // 🛡️ 2026-09-27: single source of truth for refreshing subscription data.
  // بتحدّث الـ state المحلي + الـ store العام (plan/capabilities) مع بعض، عشان
  // باقي الصفحات (ProductsView, Sidebar, ...) متفضلش على الباقة القديمة.
  const refreshSubscription = React.useCallback(() => {
    return api<any>('/api/subscription')
      .then((d) => {
        setSub(d)
        setSubscription({
          expired: Boolean(d?.expired),
          expiringSoon: Boolean(d?.expiringSoon),
          daysLeft: typeof d?.daysLeft === 'number' ? d.daysLeft : null,
          endDate: d?.endDate ?? null,
          planCode: d?.planCode ?? null,
          planName: d?.planName ?? null,
          period: d?.period ?? null,
        })
        if (Array.isArray(d?.enabledModules)) {
          setPlan({
            businessType: d.businessType === 'fashion' ? 'fashion' : 'electronics',
            enabledModules: d.enabledModules,
            capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
          })
        }
        return d
      })
      .catch(() => null)
  }, [setPlan, setSubscription])

  React.useEffect(() => {
    refreshSubscription().finally(() => setSubLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<TenantData>('/api/tenant')
      setData(d)
      setSaved(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // التغييرات غير المحفوظة
  const changed = React.useMemo(
    () => (data && saved ? TRACKED.filter((t) => data[t.key] !== saved[t.key]) : []),
    [data, saved]
  )
  const dirty = changed.length > 0
  const dirtyRef = React.useRef(false)
  dirtyRef.current = dirty

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  // (ومبنمسحش اللي المستخدم كتبه ولسه ماحفظهوش)
  useDataRefresh(['settings'], () => {
    if (!dirtyRef.current) load()
  })

  const update = <K extends keyof TenantData>(key: K, value: TenantData[K]) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'فشل رفع الشعار')
      update('logoPath', d.url)
      toast.success('تم رفع الشعار')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الرفع')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!data || saving) return
    setSaving(true)
    try {
      const out: TenantData = await api('/api/tenant', { method: 'PUT', body: data })
      setData(out)
      setSaved(out)
      setShopName(out.shopName)
      setBranding({
        phone: out.phone,
        address: out.address,
        logoPath: out.logoPath,
        invoicePrefix: out.invoicePrefix,
        // 🛡️ 2026-09-27: من غير السطر ده، تغيير المنطقة الزمنية كان بيتخزن في
        // الـ DB بس مش بينعكس على الساعة في التولبار إلا بعد ريفريش كامل.
        timezone: out.timezone,
      })
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // تنبيه المتصفح لو قفل/عمل ريفريش وفيه تغييرات لسه ماتحفظتش
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Ctrl/⌘ + S
  const saveRef = React.useRef(save)
  saveRef.current = save
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirtyRef.current) saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-72 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-96 rounded-2xl lg:col-span-7" />
          <Skeleton className="h-96 rounded-2xl lg:col-span-5" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-7" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
        </div>
      </div>
    )
  }

  const tz = data?.timezone || 'Africa/Cairo'
  const prefix = (data?.invoicePrefix || 'INV').trim() || 'INV'
  const margin = data?.defaultRetailMarginPercent ?? 20
  const retailOn = data?.dynamicRetailPricingEnabled ?? false
  const commissions: { key: 'commissionVodafoneCash' | 'commissionInstapay' | 'commissionFawry'; label: string }[] = [
    { key: 'commissionVodafoneCash', label: 'المحافظ الإلكترونية' },
    { key: 'commissionInstapay', label: 'انستاباي' },
    { key: 'commissionFawry', label: 'محفظة فوري' },
  ]

  return (
    <div className="space-y-5 pb-6">
      {/* ═════════ رأس الغرفة: شريط حبر داكن فيه هوية المحل وحالته ═════════ */}
      <header className="animate-in-up motion-reduce:animate-none relative overflow-hidden rounded-3xl bg-stone-950 text-stone-50 shadow-lg dark:bg-stone-900 dark:ring-1 dark:ring-white/10">
        {/* مسطرة قياس أعلى الشريط */}
        <div
          aria-hidden
          className="h-2 w-full text-white/30"
          style={{ backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 1px, transparent 1px 10px)' }}
        />
        {/* شبكة رسم هندسي بتخفت ناحية الشمال */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to right, black, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to right, black, transparent 70%)',
          }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5 px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-stone-50 text-stone-950 shadow-md">
              <SlidersHorizontal className="size-7" />
            </span>
            <div>
              <p dir="ltr" className="text-right text-[10px] font-bold uppercase leading-none tracking-[0.3em] text-stone-400">
                Control room
              </p>
              <h1 className="mt-1.5 text-3xl font-extrabold leading-none">الإعدادات</h1>
              <p className="mt-1.5 text-xs text-stone-400">بيانات المحل، الاشتراك، الإشعارات والتسعير</p>
            </div>
          </div>

          {/* ملخص حالة المحل */}
          <div className="flex flex-wrap items-stretch gap-2.5">
            {([
              {
                icon: Store,
                label: 'المحل',
                value: data?.shopName || '—',
                led: null as null | 'on' | 'warn' | 'off',
                ltr: false,
              },
              {
                icon: BadgeCheck,
                label: 'الباقة',
                value: sub ? `${sub.planName || '—'}${sub.daysLeft != null && !sub.expired ? ` · ${formatNumber(sub.daysLeft)} يوم` : ''}` : '—',
                led: (sub ? (sub.expired ? 'off' : sub.expiringSoon ? 'warn' : 'on') : null) as null | 'on' | 'warn' | 'off',
                ltr: false,
              },
              {
                icon: Clock,
                label: 'ساعة المحل',
                value: fmtTz(now, tz, { hour: '2-digit', minute: '2-digit', hour12: false }),
                led: 'on' as null | 'on' | 'warn' | 'off',
                ltr: true,
              },
            ]).map((c) => (
              <div key={c.label} className="flex min-w-[120px] max-w-[240px] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5">
                <c.icon className="size-4 shrink-0 text-stone-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-stone-400">{c.label}</p>
                  <p className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums">
                    {c.led && <Led tone={c.led} pulse={c.label === 'ساعة المحل'} />}
                    <span dir={c.ltr ? 'ltr' : undefined} className="truncate">{c.value}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* الحفظ */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-stone-200">
              <Led tone={dirty ? 'warn' : 'on'} pulse={dirty} />
              {dirty ? `${formatNumber(changed.length)} تغيير غير محفوظ` : 'كل التغييرات محفوظة'}
            </span>
            <Button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-xl border border-transparent bg-stone-50 font-bold text-stone-950 shadow-sm hover:bg-white disabled:border-white/15 disabled:bg-transparent disabled:text-stone-500 disabled:opacity-100"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* ═════════ هوية المحل ═════════ */}
        <Panel
          tag="01 / Identity"
          title="بيانات المحل"
          hint="الاسم والشعار والعنوان بيظهروا على الفواتير المطبوعة"
          icon={Store}
          className="stagger-1 lg:col-span-7"
          bodyClassName="flex items-center"
        >
          <div className="flex w-full flex-col gap-5 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="رفع شعار المحل"
                className="group relative flex size-28 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-foreground/30 bg-muted/50 text-muted-foreground outline-none transition-colors hover:border-foreground/50 focus-visible:ring-[3px] focus-visible:ring-foreground/20"
              >
                {data?.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.logoPath} alt="الشعار" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                    <ImagePlus className="size-6" />
                    رفع الشعار
                  </span>
                )}
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-foreground/70 text-background transition-opacity',
                    uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                  )}
                >
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <span className="text-xs font-bold">{data?.logoPath ? 'تغيير' : 'اختيار صورة'}</span>}
                </span>
              </button>
              {data?.logoPath ? (
                <button type="button" onClick={() => update('logoPath', null)} className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400">
                  إزالة الشعار
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">PNG · JPG · WEBP</span>
              )}
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Field label="اسم المحل">
                <Input className={INK_FIELD} value={data?.shopName ?? ''} onChange={(e) => update('shopName', e.target.value)} />
              </Field>
              <Field label="تليفون المحل">
                <Input className={cn(INK_FIELD, 'text-right')} dir="ltr" inputMode="tel" value={data?.phone ?? ''} onChange={(e) => update('phone', e.target.value || null)} />
              </Field>
              <Field label="العنوان" className="sm:col-span-2">
                <Input className={INK_FIELD} value={data?.address ?? ''} onChange={(e) => update('address', e.target.value || null)} />
              </Field>
              <Field label="بادئة الفواتير">
                <Input className={cn(INK_FIELD, 'text-right font-mono uppercase')} dir="ltr" value={data?.invoicePrefix ?? 'INV'} onChange={(e) => update('invoicePrefix', e.target.value)} />
              </Field>
              <Field label="المنطقة الزمنية للمحل">
                <Select value={tz} onValueChange={(v) => update('timezone', v)}>
                  <SelectTrigger className={cn(INK_FIELD, 'w-full')}>
                    <SelectValue placeholder="اختر المنطقة الزمنية" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                <Led tone="on" pulse />
                <span>
                  الساعة دلوقتي في المحل:{' '}
                  <b dir="ltr" className="tabular-nums text-foreground">{fmtTz(now, tz, { hour: '2-digit', minute: '2-digit', hour12: false })}</b>
                  {' '}— على أساسها بيتحسب «اليوم» و«الشهر» في لوحة المعلومات والتقارير.
                </span>
              </p>
            </div>
          </div>
        </Panel>

        {/* ═════════ معاينة الفاتورة ═════════ */}
        <Panel
          tag="02 / Live preview"
          title="معاينة الفاتورة"
          hint="بتتغيّر قدامك لحظة ما تكتب"
          icon={Receipt}
          className="stagger-2 lg:col-span-5"
          bodyClassName="flex items-center justify-center bg-stone-200/70 bg-[radial-gradient(rgb(0_0_0/0.10)_1px,transparent_1.2px)] [background-size:14px_14px] dark:bg-black/30 dark:bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1.2px)]"
        >
          <div className="w-full max-w-[270px]" style={{ filter: 'drop-shadow(0 8px 12px rgb(0 0 0 / 0.22))' }}>
          <div
            className="w-full bg-white px-5 pb-9 pt-5 text-stone-900"
            style={{
              WebkitMask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
              mask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
            }}
          >
            <div className="flex flex-col items-center text-center">
              {data?.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logoPath} alt="" className="size-12 rounded-lg object-cover" />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg bg-stone-900 text-xl font-extrabold text-white">
                  {(data?.shopName || 'م').trim().charAt(0)}
                </span>
              )}
              <p className="mt-2 text-sm font-extrabold leading-tight">{data?.shopName || 'اسم المحل'}</p>
              {data?.address && <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{data.address}</p>}
              {data?.phone && <p dir="ltr" className="mt-0.5 text-[11px] tabular-nums text-stone-500">{data.phone}</p>}
            </div>
            <div className="my-3 border-t border-dashed border-stone-300" />
            <div className="space-y-1 text-[11px] tabular-nums">
              <div className="flex justify-between"><span>صنف تجريبي × 2</span><span>300</span></div>
              <div className="flex justify-between text-stone-500"><span>صنف آخر × 1</span><span>150</span></div>
            </div>
            <div className="my-3 border-t border-dashed border-stone-300" />
            <div className="flex items-baseline justify-between text-sm font-extrabold tabular-nums">
              <span>الإجمالي</span><span>450 جنيه</span>
            </div>
            <div className="my-3 border-t border-dashed border-stone-300" />
            <div className="space-y-0.5 text-center text-[10px] text-stone-500">
              <p dir="ltr" className="font-mono text-xs font-bold tracking-wider text-stone-900">{prefix}-000124</p>
              <p dir="ltr" className="tabular-nums">{fmtTz(now, tz, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
              <p>شكراً لزيارتكم</p>
            </div>
          </div>
          </div>
        </Panel>

        {/* ═════════ الاشتراك ═════════ */}
        {(subLoading || sub) && (
          <Panel
            tag="03 / Subscription"
            title="الاشتراك الحالي"
            icon={BadgeCheck}
            className="stagger-3 lg:col-span-7"
            bodyClassName="flex items-center"
            aside={
              sub && (
                <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold">
                  <Led tone={sub.expired ? 'off' : sub.expiringSoon ? 'warn' : 'on'} />
                  {sub.expired ? 'منتهي' : sub.expiringSoon ? 'ينتهي قريباً' : 'فعّال'}
                </span>
              )
            }
          >
            {!sub ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : (
              <SubscriptionBody sub={sub} />
            )}
          </Panel>
        )}

        {/* ═════════ كود الاشتراك ═════════ */}
        <div className={cn('stagger-4', sub || subLoading ? 'lg:col-span-5' : 'lg:col-span-12')}>
          <RedeemCodeCard
            onRedeemed={() => {
              // نحدّث الاشتراك (الـ state المحلي + الـ store) بعد التفعيل — الكود ممكن يكون لباقة مختلفة
              setSubLoading(true)
              refreshSubscription().finally(() => setSubLoading(false))
            }}
          />
        </div>

        {/* ═════════ الإشعارات ═════════ */}
        <div className="stagger-5 lg:col-span-6">
          <NotificationSettingsCard />
        </div>

        {/* ═════════ التسعير التلقائي ═════════ */}
        <Panel
          tag="06 / Pricing"
          title="تسعير القطعة التلقائي"
          hint="سعر «قطعة» في نقطة البيع = التكلفة + هامش الربح بدل السعر الثابت. أسعار وحدات الجملة (ربع دستة، نص دستة، دستة...) بتفضل زي ما هي."
          icon={Calculator}
          className="stagger-5 lg:col-span-6"
          bodyClassName="space-y-3.5"
        >
          <SettingRow
            title="تفعيل التسعير التلقائي للقطعة"
            desc="السعر بيتحدّث فوراً في نقطة البيع لحظة اختيار وحدة «قطعة»"
            on={retailOn}
          >
            <Toggle label="تفعيل التسعير التلقائي للقطعة" checked={retailOn} onChange={(v) => update('dynamicRetailPricingEnabled', v)} disabled={saving} />
          </SettingRow>

          <Field label="نسبة هامش الربح الافتراضية" hint="تُطبَّق على أي منتج ملوش نسبة مخصصة. وتقدر تخصص نسبة لمنتج معين من بياناته.">
            <NumInput value={margin} onChange={(n) => update('defaultRetailMarginPercent', n)} suffix="%" />
          </Field>

          {/* معادلة حيّة */}
          <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <Led tone={retailOn ? 'on' : 'idle'} />
            {retailOn ? 'المعادلة المطبّقة حالياً على كل منتج ملوش نسبة مخصصة' : 'غير مفعّل حالياً — دي معاينة لشكل الحساب بعد التفعيل'}
          </p>
          <div className="flex items-stretch gap-2 text-center">
            {[
              { l: 'التكلفة', v: '100' },
              { l: `هامش ${formatNumber(margin)}%`, v: `+${formatNumber(Math.round(margin * 100) / 100)}` },
              { l: 'سعر القطعة', v: formatNumber(Math.round((100 + margin) * 100) / 100), strong: true },
            ].map((c, i) => (
              <React.Fragment key={c.l}>
                {i > 0 && <span className="self-center text-sm font-bold text-muted-foreground">{i === 2 ? '=' : '+'}</span>}
                <div className={cn('flex-1 rounded-xl border px-2 py-2', c.strong ? 'border-foreground bg-foreground text-background shadow-sm' : 'border-dashed border-foreground/30 bg-muted/50')}>
                  <p className={cn('text-[10px] font-semibold', c.strong ? 'text-background/70' : 'text-muted-foreground')}>{c.l}</p>
                  <p className="text-lg font-extrabold tabular-nums leading-tight">{i === 1 ? c.v.replace('+', '') : c.v}</p>
                </div>
              </React.Fragment>
            ))}
          </div>
        </Panel>

        {/* ═════════ عمولات الخدمات المالية ═════════ */}
        {hasFinance && (
          <Panel
            tag="07 / Fees"
            title="عمولات الخدمات المالية"
            hint="النسبة اللي بتتحسب على كل معاملة حسب وسيلة الدفع"
            icon={Percent}
            className="stagger-6 lg:col-span-8"
            bodyClassName="space-y-4"
          >
            <label className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-foreground/30 px-4 py-2.5 text-xs font-bold text-muted-foreground">
              جرّب العمولة على مبلغ
              <span className="w-32">
                <Input
                  type="number"
                  min={0}
                  value={sampleAmount}
                  onChange={(e) => setSampleAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className={cn(INK_FIELD, 'h-9 text-center font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
                />
              </span>
              <span>جنيه</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {commissions.map((c) => {
                const pct = data?.[c.key] ?? 0
                return (
                  <div key={c.key} className="space-y-2.5 rounded-xl border border-foreground/15 bg-muted/40 p-3.5">
                    <Field label={c.label}>
                      <NumInput value={pct} onChange={(n) => update(c.key, n)} suffix="%" />
                    </Field>
                    <p className="flex items-baseline justify-between border-t border-dashed pt-2 text-[11px] text-muted-foreground">
                      <span>على {formatNumber(sampleAmount)}</span>
                      <b className="text-sm tabular-nums text-foreground">{formatCurrency((sampleAmount * pct) / 100)}</b>
                    </p>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}

        {/* ═════════ الطابعة ═════════ */}
        <Panel
          tag="08 / Hardware"
          title="الطابعة الحرارية"
          hint="إعدادات طابعة ESC/POS للفواتير الحرارية"
          icon={Printer}
          className={cn('stagger-6', hasFinance ? 'lg:col-span-4' : 'lg:col-span-12')}
          bodyClassName="flex flex-col justify-between gap-5"
        >
          <div className="flex flex-wrap gap-1.5">
            {['58mm', '80mm', 'ESC/POS'].map((t) => (
              <span key={t} dir="ltr" className="rounded-lg border border-dashed border-foreground/30 bg-muted/50 px-2.5 py-1.5 font-mono text-xs font-bold text-foreground/80">{t}</span>
            ))}
          </div>
          <Button variant="outline" onClick={() => setPrinterDialogOpen(true)} className={cn('h-11 w-full gap-2 rounded-xl font-bold', INK_BTN_OUTLINE)}>
            <Printer className="size-4" />
            إعدادات الطابعة
          </Button>
        </Panel>
      </div>

      <PrinterSettingsDialog open={printerDialogOpen} onOpenChange={setPrinterDialogOpen} />

      {/* ═════════ شريط التغييرات العائم ═════════ */}
      {dirty && (
        <div role="status" aria-live="polite" className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div className="animate-in-up pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-stone-950 py-2 pe-2 ps-4 text-stone-50 shadow-2xl dark:bg-stone-800">
            <Led tone="warn" pulse />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">{formatNumber(changed.length)} تغيير غير محفوظ</p>
              <p className="hidden max-w-[260px] truncate text-[11px] text-stone-400 sm:block">
                {changed.slice(0, 3).map((c) => c.label).join(' · ')}{changed.length > 3 ? ' …' : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setData(saved)} disabled={saving} className="gap-1.5 rounded-xl text-stone-300 hover:bg-white/10 hover:text-white">
              <Undo2 className="size-3.5" />
              تراجع
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 rounded-xl bg-stone-50 font-bold text-stone-950 hover:bg-white">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              حفظ
              <kbd dir="ltr" className="hidden rounded border border-stone-950/20 px-1 font-mono text-[10px] text-stone-950/60 md:inline">Ctrl S</kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── الاشتراك: عدّاد دائري بالأيام المتبقية ───────────────────────────
function SubscriptionBody({ sub }: { sub: SubInfo }) {
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const modules = enabledModules.filter((m) => MODULE_LABELS[m])
  const totalDays = sub.period === 'yearly' ? 365 : sub.period === 'trial' ? 14 : 30
  const left = sub.expired ? 0 : Math.max(0, sub.daysLeft ?? 0)
  const remaining = Math.min(1, left / totalDays)
  const R = 46
  const C = 2 * Math.PI * R
  const stroke = sub.expired ? 'stroke-rose-500' : sub.expiringSoon ? 'stroke-amber-500' : 'stroke-emerald-500'
  const periodLabel = sub.period === 'monthly' ? 'شهري' : sub.period === 'yearly' ? 'سنوي' : sub.period === 'trial' ? 'تجربة مجانية' : sub.period
  const endDate = sub.endDate
    ? new Date(sub.endDate).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const btnLabel = sub.expired ? 'اشترك الآن' : sub.expiringSoon ? 'تجديد الاشتراك' : 'ترقية الباقة'

  return (
    <div className="w-full space-y-5">
    <div className="flex w-full flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 112 112" className="size-full -rotate-90" aria-hidden>
          <circle cx="56" cy="56" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
          <circle
            cx="56" cy="56" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - remaining)}
            className={cn('transition-[stroke-dashoffset] duration-700', stroke)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold leading-none tabular-nums">{sub.daysLeft != null ? (sub.expired ? '0' : formatNumber(left)) : '—'}</span>
          <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{sub.expired ? 'منتهي' : 'يوم متبقي'}</span>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">الباقة</p>
          <p className="truncate text-xl font-extrabold leading-tight">{sub.planName || '—'}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-x-reverse rounded-xl border border-dashed">
          <div className="px-3.5 py-2.5">
            <p className="text-[10px] text-muted-foreground">الفترة</p>
            <p className="text-sm font-bold">{periodLabel}</p>
          </div>
          <div className="px-3.5 py-2.5">
            <p className="text-[10px] text-muted-foreground">تاريخ الانتهاء</p>
            <p className="text-sm font-bold">{endDate}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/pricing" className={cn('inline-flex h-9 items-center rounded-xl px-4 text-sm font-semibold transition-colors', INK_BTN)}>
            {btnLabel}
          </a>
          <a href="/pricing" className={cn('inline-flex h-9 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors', INK_BTN_OUTLINE)}>
            <CalendarDays className="size-3.5 text-muted-foreground" />
            اشتراك سنوي
            <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-bold leading-none">وفّر 17%</span>
          </a>
        </div>
      </div>
    </div>

    {modules.length > 0 && (
      <div className="border-t border-dashed border-foreground/20 pt-4">
        <p className="mb-2.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
          <span>الأقسام المفعّلة في باقتك</span>
          <span className="tabular-nums">{formatNumber(modules.length)}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {modules.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-muted/50 px-2.5 py-1 text-xs font-semibold">
              <Led tone="on" className="size-1.5 shadow-none" />
              {MODULE_LABELS[m]}
            </span>
          ))}
        </div>
      </div>
    )}
    </div>
  )
}

// ─── NotificationSettings (2026-09-17) ────────────────────────────
// Connected to /api/notifications/settings (GET + PUT). كل مفتاح بيتحفظ فورًا.
function NotificationSettingsCard() {
  const [prefs, setPrefs] = React.useState<{
    notifyLowStock: boolean
    notifyExpiringSubscription: boolean
    notifyNewSales: boolean
  } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{
        notifyLowStock: boolean
        notifyExpiringSubscription: boolean
        notifyNewSales: boolean
      }>('/api/notifications/settings')
      setPrefs(data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['notifications'], load)

  const toggle = async (key: 'notifyLowStock' | 'notifyExpiringSubscription' | 'notifyNewSales', value: boolean) => {
    if (!prefs) return
    // Optimistic update
    setPrefs({ ...prefs, [key]: value })
    setSaving(true)
    try {
      await api('/api/notifications/settings', { method: 'PUT', body: { [key]: value } })
      toast.success(value ? 'تم تفعيل الإشعار' : 'تم تعطيل الإشعار')
    } catch {
      // Revert on error
      setPrefs({ ...prefs, [key]: !value })
      toast.error('فشل تحديث الإعداد')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) {
    return <Skeleton className="h-64 w-full rounded-2xl" />
  }

  return (
    <Panel
      tag="05 / Alerts"
      title="إعدادات الإشعارات"
      hint="تحكم في أنواع الإشعارات التي تظهر في جرس الإشعارات"
      icon={Bell}
      className="h-full"
      bodyClassName="flex flex-col gap-3"
      aside={<span className="rounded-md border border-dashed px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">يُحفظ فورًا</span>}
    >
      <SettingRow className="flex-1" title="تنبيهات نقص المخزون" desc="إشعار عند وصول أي منتج للحد الأدنى" on={prefs.notifyLowStock}>
        <Toggle label="تنبيهات نقص المخزون" checked={prefs.notifyLowStock} onChange={(v) => toggle('notifyLowStock', v)} disabled={saving} />
      </SettingRow>
      <SettingRow className="flex-1" title="تنبيهات انتهاء الاشتراك" desc="إشعار قبل انتهاء الاشتراك بـ 7 أيام" on={prefs.notifyExpiringSubscription}>
        <Toggle label="تنبيهات انتهاء الاشتراك" checked={prefs.notifyExpiringSubscription} onChange={(v) => toggle('notifyExpiringSubscription', v)} disabled={saving} />
      </SettingRow>
      {/* backend not yet implemented */}
      <SettingRow className="flex-1" title="إشعارات المبيعات الجديدة" desc="إشعار عند كل عملية بيع جديدة — سيُفعَّل في تحديث قادم" badge="قريباً" muted>
        <Toggle label="إشعارات المبيعات الجديدة" checked={false} onChange={() => {}} disabled stateLabel="قريباً" />
      </SettingRow>
    </Panel>
  )
}

// ─── PlanSwitcher (2026-09-15 v4) ──────────────────────────────────
// Self-service plan switcher. Lets a tenant admin switch their active
// subscription to one of the 4 canonical plans. Useful for users who
// signed up before the canonical-plan flow was deployed and are still on
// the legacy `trial` plan with empty enabledModules.
//
// Visible to ADMIN role only. The endpoint enforces this server-side too.
function PlanSwitcher({
  currentPlanCode,
  onSwitched,
}: {
  currentPlanCode: string | null
  onSwitched: () => void
}) {
  // Only render this for ADMINs. We can read role from useShopStore.
  const role = useShopStore((s) => s.user?.role)
  const [switching, setSwitching] = React.useState<string | null>(null)
  // Don't render for EMPLOYEE — they don't have permission to switch.
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null

  const PLANS: { code: string; name: string; desc: string; tone: string }[] = [
    {
      code: 'electronics-basic',
      name: 'أساسية - موبايل وكمبيوتر',
      desc: 'POS، مخزون، صيانة، معاملات مالية',
      tone: 'border-sky-500/40',
    },
    {
      code: 'electronics-pro',
      name: 'احترافية - موبايل وكمبيوتر',
      desc: 'كل المزايا + تقارير متقدمة، فروع، جملة',
      tone: 'border-violet-500/40',
    },
    {
      code: 'fashion-basic',
      name: 'أساسية - ملابس وأحذية',
      desc: 'POS، مخزون، مقاسات وألوان، مصروفات، خزنة (للتجزئة — بيع بالقطعة)',
      tone: 'border-rose-400/50',
    },
    {
      code: 'fashion-pro',
      name: 'احترافية - ملابس وأحذية',
      desc: 'لتجار الجملة — بيع بالكرتونة/الدستة + كوليكشن. بدون مقاسات/ألوان (تقدر تبيع بلقطعة كـ وحدة factor=1).',
      tone: 'border-amber-400/50',
    },
  ]

  const handleSwitch = async (planCode: string) => {
    if (switching) return
    if (planCode === currentPlanCode) {
      toast.info('إنت уже على الباقة دي')
      return
    }
    if (!confirm(`هل أنت متأكد إنك عاوز تبديل باقتك لـ "${PLANS.find((p) => p.code === planCode)?.name}"؟`)) {
      return
    }
    setSwitching(planCode)
    try {
      const result = await api<{ ok: boolean; subscription: { planCode: string; planName: string } }>(
        '/api/subscription/switch-plan',
        { method: 'POST', body: { planCode } }
      )
      toast.success(`تم تبديل باقتك لـ "${result.subscription.planName}"`)
      onSwitched()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تبديل الباقة')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          تبديل الباقة
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          لو إنت على الباقة التجريبية (trial) ولا enabledModules بتاعتها فاضية — اختار الباقة المناسبة لطب تجارتك. التبديل فوري وميجّيش فلوس.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLANS.map((p) => {
            const isCurrent = p.code === currentPlanCode
            const isSwitching = switching === p.code
            return (
              <div
                key={p.code}
                className={`flex flex-col gap-2 rounded-md border-t-4 ${p.tone} p-3 transition-colors ${
                  isCurrent ? 'bg-success-subtle/40 border-success-subtle' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold leading-tight">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.desc}</p>
                    <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{p.code}</p>
                  </div>
                  {isCurrent && (
                    <Badge variant="outline" className="bg-success-subtle text-success-subtle-foreground border-success-subtle shrink-0">
                      الحالية
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isCurrent ? 'outline' : 'default'}
                  className="mt-auto gap-1.5"
                  disabled={isCurrent || isSwitching || switching !== null}
                  onClick={() => handleSwitch(p.code)}
                >
                  {isSwitching ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isCurrent ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : null}
                  {isCurrent ? 'الباقة الحالية' : isSwitching ? 'جارٍ التبديل...' : 'تبديل لهذه الباقة'}
                </Button>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          ملاحظة: التبديل بيغيّر الـ plan في الـ DB، فالـ sidebar هيتحدّث تلقائياً خلال 5 ثواني (بناءً على cache الـ subscription endpoint).
        </p>
      </CardContent>
    </Card>
  )
}
