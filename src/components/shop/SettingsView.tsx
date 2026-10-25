'use client'

import { uploadImage } from '@/lib/upload-image'
import * as React from 'react'
import {
  ImagePlus, Loader2, Save, Sparkles, CalendarDays, CheckCircle2, Printer, Bell,
  SlidersHorizontal, LayoutGrid, Store, Receipt, BadgeCheck, Percent, Calculator, Undo2, Clock,
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
  productCardStyle: 'auto' | 'image' | 'compact'
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
  { key: 'productCardStyle', label: 'شكل بطاقة المنتج' },
]

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

function useNow() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  return now
}

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

  const [sub, setSub] = React.useState<SubInfo | null>(null)
  const [subLoading, setSubLoading] = React.useState(true)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const setPlan = useShopStore((s) => s.setPlan)
  const setSubscription = useShopStore((s) => s.setSubscription)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const hasFinance = enabledModules.includes('finance')
  const hasWholesale = capabilities.includes('multi_unit')
  const isFoodShop = useShopStore((s) => s.plan.businessType) === 'food'

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
            businessType: d.businessType === 'fashion' ? 'fashion' : d.businessType === 'food' ? 'food' : 'electronics',
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

  const changed = React.useMemo(
    () => (data && saved ? TRACKED.filter((t) => data[t.key] !== saved[t.key]) : []),
    [data, saved]
  )
  const dirty = changed.length > 0
  const dirtyRef = React.useRef(false)
  // 🛡️ 2026-10-19: تحديث الـ ref في effect بدل أثناء الرندر (قاعدة react-hooks/refs)
  React.useEffect(() => { dirtyRef.current = dirty })

  useDataRefresh(['settings'], () => {
    if (!dirtyRef.current) load()
  })

  const update = <K extends keyof TenantData>(key: K, value: TenantData[K]) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      update('logoPath', await uploadImage(file, 'logo', 'فشل رفع الشعار'))
      toast.success('تم رفع الشعار')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الرفع')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!data || saving) return
    const body: Record<string, unknown> = {}
    for (const t of TRACKED) {
      if (saved && data[t.key] !== saved[t.key]) body[t.key] = data[t.key]
    }
    if (Object.keys(body).length === 0) return
    setSaving(true)
    try {
      const out: TenantData = await api('/api/tenant', { method: 'PUT', body })
      setData(out)
      setSaved(out)
      setShopName(out.shopName)
      setBranding({
        phone: out.phone,
        address: out.address,
        logoPath: out.logoPath,
        invoicePrefix: out.invoicePrefix,
        timezone: out.timezone,
      })
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const saveRef = React.useRef(save)
  // 🛡️ 2026-10-19: تحديث الـ ref في effect بدل أثناء الرندر (قاعدة react-hooks/refs)
  React.useEffect(() => { saveRef.current = save })
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
      <div className="space-y-4 sm:space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl sm:w-72" />
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
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
  const pricingLocked = !capabilities.includes('dynamic_retail_pricing')
  const commissions: { key: 'commissionVodafoneCash' | 'commissionInstapay' | 'commissionFawry'; label: string }[] = [
    { key: 'commissionVodafoneCash', label: 'المحافظ الإلكترونية' },
    { key: 'commissionInstapay', label: 'انستاباي' },
    { key: 'commissionFawry', label: 'محفظة فوري' },
  ]

  return (
    <div className="space-y-4 pb-6 sm:space-y-5">
      {/* ═════════ رأس الغرفة: شريط حبر داكن ═════════ */}
      <header className="animate-in-up motion-reduce:animate-none relative overflow-hidden rounded-2xl bg-stone-950 text-stone-50 shadow-lg sm:rounded-3xl dark:bg-stone-900 dark:ring-1 dark:ring-white/10">
        <div
          aria-hidden
          className="h-2 w-full text-white/30"
          style={{ backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 1px, transparent 1px 10px)' }}
        />
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

        <div className="relative flex flex-col gap-4 px-4 pb-4 pt-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-4 sm:px-7 sm:pb-6 sm:pt-4">
          {/* الهوية */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-stone-50 text-stone-950 shadow-md sm:size-14">
              <SlidersHorizontal className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0">
              <p dir="ltr" className="text-right text-[10px] font-bold uppercase leading-none tracking-[0.3em] text-stone-400">
                Control room
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold leading-none sm:text-3xl">الإعدادات</h1>
              <p className="mt-1.5 text-[11px] text-stone-400 sm:text-xs">بيانات المحل، الاشتراك، الإشعارات والتسعير</p>
            </div>
          </div>

          {/* ملخص حالة المحل — الباقة في صف كامل، والمحل + الساعة جنب بعض */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:gap-2.5">
            {([
              {
                icon: BadgeCheck,
                label: 'الباقة',
                value: sub ? `${sub.planName || '—'}${sub.daysLeft != null && !sub.expired ? ` · ${formatNumber(sub.daysLeft)} يوم` : ''}` : '—',
                led: (sub ? (sub.expired ? 'off' : sub.expiringSoon ? 'warn' : 'on') : null) as null | 'on' | 'warn' | 'off',
                ltr: false,
                full: true,
              },
              {
                icon: Store,
                label: 'المحل',
                value: data?.shopName || '—',
                led: null as null | 'on' | 'warn' | 'off',
                ltr: false,
                full: false,
              },
              {
                icon: Clock,
                label: 'ساعة المحل',
                value: fmtTz(now, tz, { hour: '2-digit', minute: '2-digit', hour12: false }),
                led: 'on' as null | 'on' | 'warn' | 'off',
                ltr: true,
                full: false,
              },
            ]).map((c) => (
              <div
                key={c.label}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-2.5 py-2 sm:min-w-[120px] sm:max-w-[240px] sm:gap-2.5 sm:px-3.5 sm:py-2.5',
                  c.full && 'col-span-2'
                )}
              >
                <c.icon className="size-4 shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-stone-400">{c.label}</p>
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold tabular-nums sm:text-sm">
                    {c.led && <Led tone={c.led} pulse={c.label === 'ساعة المحل'} />}
                    <span dir={c.ltr ? 'ltr' : undefined} className="truncate">{c.value}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* الحفظ */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-stone-200 sm:flex-none sm:justify-start sm:gap-2 sm:px-3 sm:text-xs">
              <Led tone={dirty ? 'warn' : 'on'} pulse={dirty} />
              <span className="truncate">{dirty ? `${formatNumber(changed.length)} تغيير غير محفوظ` : 'كل التغييرات محفوظة'}</span>
            </span>
            <Button
              onClick={save}
              disabled={!dirty || saving}
              className="h-9 shrink-0 rounded-xl border border-transparent bg-stone-50 px-3 text-sm font-bold text-stone-950 shadow-sm hover:bg-white disabled:border-white/15 disabled:bg-transparent disabled:text-stone-500 disabled:opacity-100 sm:h-10 sm:px-4"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        {/* ═════════ هوية المحل ═════════ */}
        <Panel
          tag="01 / Identity"
          title="بيانات المحل"
          hint="الاسم والشعار والعنوان بيظهروا على الفواتير المطبوعة"
          icon={Store}
          className="stagger-1 lg:col-span-7"
          bodyClassName="flex items-center"
        >
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:gap-5">
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
                className="group relative flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-foreground/30 bg-muted/50 text-muted-foreground outline-none transition-colors hover:border-foreground/50 focus-visible:ring-[3px] focus-visible:ring-foreground/20 sm:size-28"
              >
                {data?.logoPath ? (
                   
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

            <div className="grid flex-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
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
              <p className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:col-span-2 sm:items-center sm:text-xs">
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
              className="w-full bg-white px-4 pb-9 pt-5 text-stone-900 sm:px-5"
              style={{
                WebkitMask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
                mask: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%',
              }}
            >
              <div className="flex flex-col items-center text-center">
                {data?.logoPath ? (
                   
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
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold sm:gap-2 sm:px-2.5 sm:text-[11px]">
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
        {hasWholesale && !isFoodShop && (
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
              desc={pricingLocked ? 'ميزة الباقة الاحترافية — الترقية بتفتح القسم ده' : 'السعر بيتحدّث فوراً في نقطة البيع لحظة اختيار وحدة «قطعة»'}
              on={retailOn}
            >
              <Toggle label="تفعيل التسعير التلقائي للقطعة" checked={retailOn} onChange={(v) => update('dynamicRetailPricingEnabled', v)} disabled={saving || pricingLocked} />
            </SettingRow>

            <Field label="نسبة هامش الربح الافتراضية" hint={pricingLocked ? 'بيتفتح مع الباقة الاحترافية' : 'تُطبَّق على أي منتج ملوش نسبة مخصصة. وتقدر تخصص نسبة لمنتج معين من بياناته.'}>
              <NumInput value={margin} onChange={(n) => update('defaultRetailMarginPercent', n)} suffix="%" disabled={saving || pricingLocked} />
            </Field>

            <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <Led tone={retailOn ? 'on' : 'idle'} />
              {retailOn ? 'المعادلة المطبّقة حالياً على كل منتج ملوش نسبة مخصصة' : 'غير مفعّل حالياً — دي معاينة لشكل الحساب بعد التفعيل'}
            </p>
            <div className="flex items-stretch gap-1.5 text-center sm:gap-2">
              {[
                { l: 'التكلفة', v: '100' },
                { l: `هامش ${formatNumber(margin)}%`, v: `+${formatNumber(Math.round(margin * 100) / 100)}` },
                { l: 'سعر القطعة', v: formatNumber(Math.round((100 + margin) * 100) / 100), strong: true },
              ].map((c, i) => (
                <React.Fragment key={c.l}>
                  {i > 0 && <span className="self-center text-sm font-bold text-muted-foreground">{i === 2 ? '=' : '+'}</span>}
                  <div className={cn('min-w-0 flex-1 rounded-xl border px-1.5 py-2 sm:px-2', c.strong ? 'border-foreground bg-foreground text-background shadow-sm' : 'border-dashed border-foreground/30 bg-muted/50')}>
                    <p className={cn('truncate text-[10px] font-semibold', c.strong ? 'text-background/70' : 'text-muted-foreground')}>{c.l}</p>
                    <p className="truncate text-base font-extrabold tabular-nums leading-tight sm:text-lg">{i === 1 ? c.v.replace('+', '') : c.v}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Panel>
        )}

        {/* ═════════ شكل بطاقة المنتج ═════════ */}
        <Panel
          tag="09 / Products"
          title="شكل بطاقة المنتج"
          hint="بيأثر على صفحة المنتجات بس. لو أغلب منتجاتك من غير صور، اختار «بدون صورة» عشان تشوف منتجات أكتر في الشاشة."
          icon={LayoutGrid}
          className="stagger-5 lg:col-span-6"
          bodyClassName="space-y-3"
        >
          <div role="radiogroup" aria-label="شكل بطاقة المنتج" className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['auto', 'تلقائي', 'حسب وجود صور في المنتجات'],
                ['image', 'بصورة', 'صورة كبيرة لكل منتج'],
                ['compact', 'بدون صورة', 'مضغوطة — أنسب لو مفيش صور'],
              ] as const
            ).map(([v, label, desc]) => {
              const on = (data?.productCardStyle ?? 'auto') === v
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => update('productCardStyle', v)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-start transition-colors disabled:opacity-60',
                    on ? 'border-foreground bg-foreground text-background shadow-sm' : 'border-dashed border-foreground/25 hover:bg-muted/60'
                  )}
                >
                  <p className="text-sm font-extrabold">{label}</p>
                  <p className={cn('mt-0.5 text-[11px]', on ? 'text-background/70' : 'text-muted-foreground')}>{desc}</p>
                </button>
              )
            })}
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
            <label className="flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-foreground/30 px-3 py-2.5 text-xs font-bold text-muted-foreground sm:gap-3 sm:px-4">
              جرّب العمولة على مبلغ
              <span className="w-28 sm:w-32">
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
        <div role="status" aria-live="polite" className="pointer-events-none sticky bottom-3 z-30 flex justify-center px-2 sm:bottom-4 sm:px-0">
          <div className="animate-in-up pointer-events-auto flex w-full max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-stone-950 px-3 py-2 text-stone-50 shadow-2xl sm:w-auto sm:gap-3 sm:ps-4 sm:pe-2 dark:bg-stone-800">
            <Led tone="warn" pulse />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight sm:text-sm">{formatNumber(changed.length)} تغيير غير محفوظ</p>
              <p className="hidden max-w-[260px] truncate text-[11px] text-stone-400 sm:block">
                {changed.slice(0, 3).map((c) => c.label).join(' · ')}{changed.length > 3 ? ' …' : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setData(saved)} disabled={saving} className="h-8 shrink-0 gap-1 rounded-xl px-2 text-stone-300 hover:bg-white/10 hover:text-white sm:h-9 sm:gap-1.5 sm:px-3">
              <Undo2 className="size-3.5" />
              <span className="hidden sm:inline">تراجع</span>
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 shrink-0 gap-1.5 rounded-xl bg-stone-50 px-3 font-bold text-stone-950 hover:bg-white sm:h-9 sm:px-3">
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
    <div className="w-full space-y-4 sm:space-y-5">
      <div className="flex w-full flex-col items-center gap-5 sm:flex-row sm:gap-6">
        <div className="relative size-28 shrink-0 sm:size-32">
          <svg viewBox="0 0 112 112" className="size-full -rotate-90" aria-hidden>
            <circle cx="56" cy="56" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
            <circle
              cx="56" cy="56" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - remaining)}
              className={cn('transition-[stroke-dashoffset] duration-700', stroke)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold leading-none tabular-nums sm:text-3xl">{sub.daysLeft != null ? (sub.expired ? '0' : formatNumber(left)) : '—'}</span>
            <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{sub.expired ? 'منتهي' : 'يوم متبقي'}</span>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 space-y-3.5 sm:space-y-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">الباقة</p>
            <p className="truncate text-lg font-extrabold leading-tight sm:text-xl">{sub.planName || '—'}</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-x-reverse rounded-xl border border-dashed">
            <div className="min-w-0 px-3 py-2.5 sm:px-3.5">
              <p className="text-[10px] text-muted-foreground">الفترة</p>
              <p className="truncate text-sm font-bold">{periodLabel}</p>
            </div>
            <div className="min-w-0 px-3 py-2.5 sm:px-3.5">
              <p className="text-[10px] text-muted-foreground">تاريخ الانتهاء</p>
              <p className="truncate text-sm font-bold">{endDate}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/pricing" className={cn('inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold transition-colors sm:px-4 sm:text-sm', INK_BTN)}>
              {btnLabel}
            </a>
            <a href="/pricing" className={cn('inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm', INK_BTN_OUTLINE)}>
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

// ─── NotificationSettings ────────────────────────────
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

  useDataRefresh(['notifications'], load)

  const toggle = async (key: 'notifyLowStock' | 'notifyExpiringSubscription' | 'notifyNewSales', value: boolean) => {
    if (!prefs) return
    setPrefs({ ...prefs, [key]: value })
    setSaving(true)
    try {
      await api('/api/notifications/settings', { method: 'PUT', body: { [key]: value } })
      toast.success(value ? 'تم تفعيل الإشعار' : 'تم تعطيل الإشعار')
    } catch {
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
      <SettingRow className="flex-1" title="إشعارات المبيعات الجديدة" desc="إشعار عند كل عملية بيع جديدة — سيُفعَّل في تحديث قادم" badge="قريباً" muted>
        <Toggle label="إشعارات المبيعات الجديدة" checked={false} onChange={() => {}} disabled stateLabel="قريباً" />
      </SettingRow>
    </Panel>
  )
}

// ─── PlanSwitcher ──────────────────────────────────
function PlanSwitcher({
  currentPlanCode,
  onSwitched,
}: {
  currentPlanCode: string | null
  onSwitched: () => void
}) {
  const role = useShopStore((s) => s.user?.role)
  const [switching, setSwitching] = React.useState<string | null>(null)
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
      desc: 'سلاسل المحلات وتجار الجملة — فروع، بيع بالكرتونة/الدستة + كوليكشن، والمقاسات والألوان متاحة برضه (البيع بالقطعة شغال).',
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
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Sparkles className="size-4 text-primary" />
          تبديل الباقة
        </CardTitle>
        <p className="text-[11px] text-muted-foreground sm:text-xs">
          طول فترة التجربة المجانية تقدر تبدّل لأي باقة تناسب نشاطك والتبديل فوري ومن غير فلوس. بعد ما تشترك، الترقية بتتم من صفحة الأسعار والدفع.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{p.desc}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">{p.code}</p>
                  </div>
                  {isCurrent && (
                    <Badge variant="outline" className="shrink-0 border-success-subtle bg-success-subtle text-success-subtle-foreground">
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
        <p className="mt-3 text-[11px] text-muted-foreground">
          ملاحظة: التبديل بيغيّر الـ plan في الـ DB، فالـ sidebar هيتحدّث تلقائياً خلال 5 ثواني (بناءً على cache الـ subscription endpoint).
        </p>
      </CardContent>
    </Card>
  )
}