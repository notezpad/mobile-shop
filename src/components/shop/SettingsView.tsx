'use client'

import * as React from 'react'
import { ImagePlus, Loader2, Save, Upload, Sparkles, Calendar, CalendarDays, AlertTriangle, CheckCircle2, Printer, Bell, Ticket } from 'lucide-react'
import { PrinterSettingsDialog } from './PrinterSettingsDialog'
import { RedeemCodeCard } from './RedeemCodeCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { formatCurrency } from '@/lib/format'

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
  wholesaleEnabled: boolean
  retailEnabled: boolean
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

export function SettingsView() {
  const [data, setData] = React.useState<TenantData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [printerDialogOpen, setPrinterDialogOpen] = React.useState(false)

  // Subscription info — loaded separately from /api/subscription
  const [sub, setSub] = React.useState<{
    planName: string
    planCode: string
    period: string
    endDate: string
    daysLeft: number | null
    expired: boolean
    expiringSoon: boolean
  } | null>(null)
  const [subLoading, setSubLoading] = React.useState(true)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const setPlan = useShopStore((s) => s.setPlan)
  const setSubscription = useShopStore((s) => s.setSubscription)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')

  // 🛡️ 2026-09-27: single source of truth for refreshing subscription data.
  // Previously every caller (initial load, RedeemCodeCard.onRedeemed, the
  // now-removed PlanSwitcher.onSwitched) only did `setSub(d)` — updating
  // THIS component's own local badge/expiry display but never touching the
  // global `plan.{enabledModules,capabilities}` in useShopStore. Every other
  // page (ProductsView, Sidebar, ...) reads capabilities from that global
  // store, so after redeeming a code tied to a different plan, this page
  // would correctly show the new plan name while the rest of the app kept
  // running on the OLD capabilities until a hard refresh — e.g. the
  // "variants" (sizes/colors) capability silently missing from ProductsView
  // even though no product data was touched. This helper updates both.
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
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const update = <K extends keyof TenantData>(
    key: K,
    value: TenantData[K]
  ) => {
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
    if (!data) return
    setSaving(true)
    try {
      const out: TenantData = await api('/api/tenant', {
        method: 'PUT',
        body: data,
      })
      setData(out)
      setShopName(out.shopName)
      setBranding({
        phone: out.phone,
        address: out.address,
        logoPath: out.logoPath,
        invoicePrefix: out.invoicePrefix,
        // 🛡️ 2026-09-27: من غير السطر ده، تغيير المنطقة الزمنية من هنا كان
        // بيتخزن في الـ DB بس مش بينعكس على الساعة/التاريخ في التولبار
        // فوق إلا بعد ريفريش كامل للصفحة، لأن LiveClock بياخد القيمة من
        // الـ store مباشرة.
        timezone: out.timezone,
      })
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          بيانات المحل وعمولات الخدمات المالية
        </p>
      </div>

      {/* ─── الاشتراك الحالي ─── */}
      {subLoading ? (
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-2"><div className="h-2.5 w-20 rounded bg-muted" /><div className="h-5 w-36 rounded bg-muted" /></div>
            <div className="h-7 w-16 rounded-full bg-muted" />
          </div>
          <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-14 rounded-lg bg-muted" />)}</div>
          <div className="h-2 w-full rounded-full bg-muted" />
          <div className="flex gap-2"><div className="h-9 w-28 rounded-lg bg-muted" /><div className="h-9 w-36 rounded-lg bg-muted" /></div>
        </div>
      ) : sub && (() => {
        const isExpired   = sub.expired
        const isSoon      = sub.expiringSoon
        const totalDays   = sub.period === 'monthly' ? 30 : sub.period === 'yearly' ? 365 : sub.period === 'trial' ? 14 : 30
        const progressPct = Math.min(100, Math.round((Math.max(0, totalDays - (sub.daysLeft ?? 0)) / totalDays) * 100))
        const periodLabel = sub.period === 'monthly' ? 'شهري' : sub.period === 'yearly' ? 'سنوي' : sub.period === 'trial' ? 'تجربة مجانية' : sub.period
        const endDate     = sub.endDate ? new Date(sub.endDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
        const btnLabel    = isExpired ? 'اشترك الآن' : isSoon ? 'تجديد الاشتراك' : 'ترقية الباقة'

        const c = isExpired
          ? { solid: '#dc2626', light: '#fee2e2', border: '#fecaca', text: '#991b1b', label: 'منتهي',        bar: '#ef4444' }
          : isSoon
          ? { solid: '#d97706', light: '#fef3c7', border: '#fde68a', text: '#92400e', label: 'ينتهي قريباً', bar: '#f59e0b' }
          : { solid: '#059669', light: '#d1fae5', border: '#a7f3d0', text: '#065f46', label: 'فعّال',         bar: '#10b981' }

        return (
          <div className="rounded-xl border border-border bg-card overflow-hidden">

            {/* شريط اللون العلوي */}
            <div className="h-1 w-full" style={{ background: c.solid }} />

            <div className="p-5 space-y-4">

              {/* اسم الباقة + الحالة */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">الاشتراك الحالي · {periodLabel}</p>
                  <p className="text-xl font-bold text-foreground">{sub.planName || '—'}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: c.light, borderColor: c.border, color: c.text }}>
                  <span className="size-1.5 rounded-full" style={{ background: c.solid }} />
                  {c.label}
                </span>
              </div>

              {/* 3 خلايا معلومات */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: 'الفترة',          value: periodLabel,  color: undefined },
                  { label: 'تاريخ الانتهاء',  value: endDate,      color: undefined },
                  { label: 'الأيام المتبقية', value: sub.daysLeft != null ? (isExpired ? 'منتهي' : `${sub.daysLeft} يوم`) : '—', color: c.text },
                ] as { label: string; value: string; color: string | undefined }[]).map((cell, i) => (
                  <div key={i} className="rounded-lg bg-muted/50 border border-border px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground mb-1">{cell.label}</p>
                    <p className="text-sm font-semibold leading-tight text-foreground"
                      style={cell.color ? { color: cell.color } : undefined}>
                      {cell.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* شريط التقدم */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>مدة الاشتراك المستهلكة</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%`, background: c.bar }} />
                </div>
              </div>

              {/* أزرار */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                <a href="/pricing"
                  className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 mt-3"
                  style={{ background: c.solid }}>
                  {btnLabel}
                </a>
                <a href="/pricing"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted mt-3">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  اشتراك سنوي
                  <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                    style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                    وفّر 17%
                  </span>
                </a>
              </div>

            </div>
          </div>
        )
      })()}

      {/* 🛡️ 2026-09-21: Redeem Code card — lets the user apply an activation
          code (generated by the admin from the admin panel) to activate or
          renew their subscription. Visible to ALL users (not just expired),
          so users can stack a renewal code while still active. */}
      <RedeemCodeCard
        onRedeemed={() => {
          // Refresh subscription data (local badge + global store) after a
          // successful redeem — a code can be tied to a different plan than
          // the one the tenant is currently on.
          setSubLoading(true)
          refreshSubscription().finally(() => setSubLoading(false))
        }}
      />

      {/* 🛡️ 2026-09-27: PlanSwitcher removed — it was a self-testing tool
          for migrating legacy `trial` tenants to a canonical plan, and it's
          no longer needed day-to-day. It also had a real bug: switching
          only updated this page's own local `sub` state, not the global
          plan/capabilities in useShopStore — so pages like ProductsView
          (which read capabilities from the store) wouldn't reflect the new
          plan until a hard refresh, making a successful switch LOOK like it
          silently lost the "variants" (colors/sizes) capability. No product
          data was ever touched by switching plans — it was purely a stale
          UI-state bug. See PlanSwitcher's old definition (kept below,
          unused) if this ever needs to come back for a specific tenant. */}

      {/* 🛡️ 2026-09-17: Notification settings — connected to /api/notifications/settings */}
      <NotificationSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات المحل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {data?.logoPath ? (
                <img
                  src={data.logoPath}
                  alt="الشعار"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImagePlus className="size-8 text-muted-foreground" />
              )}
            </div>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              اختيار صورة
            </Button>
            {data?.logoPath && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => update('logoPath', null)}
              >
                إزالة
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="اسم المحل">
              <Input
                value={data?.shopName ?? ''}
                onChange={(e) => update('shopName', e.target.value)}
              />
            </Field>
            <Field label="تليفون المحل">
              <Input
                value={data?.phone ?? ''}
                onChange={(e) =>
                  update('phone', e.target.value || null)
                }
              />
            </Field>
            <Field label="العنوان" full>
              <Input
                value={data?.address ?? ''}
                onChange={(e) =>
                  update('address', e.target.value || null)
                }
              />
            </Field>
            <Field label="بادئة الفواتير">
              <Input
                value={data?.invoicePrefix ?? 'INV'}
                onChange={(e) => update('invoicePrefix', e.target.value)}
              />
            </Field>
            <Field label="المنطقة الزمنية للمحل" full>
              <Select
                value={data?.timezone || 'Africa/Cairo'}
                onValueChange={(v) => update('timezone', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المنطقة الزمنية" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                على أساسها بيتحسب "اليوم" و"الشهر" في لوحة المعلومات والتقارير — مهم لو المحل خارج توقيت القاهرة.
              </p>
            </Field>
          </div>
        </CardContent>
      </Card>

      {hasFinance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">عمولات الخدمات المالية (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="عمولة محافظ إلكترونية %">
                <Input
                  type="number"
                  step="0.1"
                  value={String(data?.commissionVodafoneCash ?? 0)}
                  onChange={(e) =>
                    update(
                      'commissionVodafoneCash',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </Field>
              <Field label="عمولة انستاباي %">
                <Input
                  type="number"
                  step="0.1"
                  value={String(data?.commissionInstapay ?? 0)}
                  onChange={(e) =>
                    update(
                      'commissionInstapay',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </Field>
              <Field label="عمولة محفظة فوري %">
                <Input
                  type="number"
                  step="0.1"
                  value={String(data?.commissionFawry ?? 0)}
                  onChange={(e) =>
                    update(
                      'commissionFawry',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>خطة الأسعار (جملة / قطاعي)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={!!data?.wholesaleEnabled}
                onChange={(e) => update('wholesaleEnabled', e.target.checked)}
              />
              <div>
                <div className="font-medium">تفعيل البيع بالجملة</div>
                <div className="text-xs text-muted-foreground mt-1">
                  عند التفعيل يظهر اختيار الوحدة (ربع/نص/دستة/ونص دستة) في نقطة البيع.
                  عند التعطيل تُخفى الوحدات ويُستخدم سعر القطاعي فقط.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-not-allowed opacity-60">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={!!data?.retailEnabled}
                disabled
                readOnly
              />
              <div>
                <div className="font-medium flex items-center gap-2">
                  تفعيل البيع بالقطاعي
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                    قريباً
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  السعر القطاعي يظهر كسعر بيع القطعة الواحدة — هذا الخيار سيُفعَّل في تحديث قادم.
                </div>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ─── الطابعة الحرارية ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطابعة الحرارية</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            اضبط إعدادات طابعة ESC/POS للفواتير الحرارية (58mm / 80mm)
          </p>
          <Button variant="outline" onClick={() => setPrinterDialogOpen(true)} className="gap-2">
            <Printer className="size-4" />
            إعدادات الطابعة
          </Button>
        </CardContent>
      </Card>

      <PrinterSettingsDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
      />

      <div className="flex justify-end">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  )
}

// ─── NotificationSettings (2026-09-17) ────────────────────────────
// Connected to /api/notifications/settings (GET + PUT).
// Previously: the notification preferences existed in the DB (Tenant model)
// and were read by checkLowStockAndNotify / checkExpiringSubscriptions,
// but there was NO UI to change them. They were stuck at their defaults.
// Now: the user can toggle them from the Settings page.
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

  const toggle = async (key: 'notifyLowStock' | 'notifyExpiringSubscription' | 'notifyNewSales', value: boolean) => {
    if (!prefs) return
    // Optimistic update
    setPrefs({ ...prefs, [key]: value })
    setSaving(true)
    try {
      await api('/api/notifications/settings', {
        method: 'PUT',
        body: { [key]: value },
      })
      toast.success(value ? 'تم تفعيل الإشعار' : 'تم تعطيل الإشعار')
    } catch (e: any) {
      // Revert on error
      setPrefs({ ...prefs, [key]: !value })
      toast.error('فشل تحديث الإعداد')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) {
    return <Skeleton className="h-48 w-full" />
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          إعدادات الإشعارات
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          تحكم في أنواع الإشعارات التي تظهر في جرس الإشعارات
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Notify low stock */}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex-1">
            <p className="text-sm font-medium">تنبيهات نقص المخزون</p>
            <p className="text-xs text-muted-foreground">إشعار عند وصول أي منتج للحد الأدنى</p>
          </div>
          <Switch
            checked={prefs.notifyLowStock}
            onCheckedChange={(v) => toggle('notifyLowStock', v === true)}
            disabled={saving}
          />
        </div>

        {/* Notify expiring subscription */}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex-1">
            <p className="text-sm font-medium">تنبيهات انتهاء الاشتراك</p>
            <p className="text-xs text-muted-foreground">إشعار قبل انتهاء الاشتراك بـ 7 أيام</p>
          </div>
          <Switch
            checked={prefs.notifyExpiringSubscription}
            onCheckedChange={(v) => toggle('notifyExpiringSubscription', v === true)}
            disabled={saving}
          />
        </div>

        {/* Notify new sales — backend not yet implemented */}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 opacity-60">
          <div className="flex-1">
            <p className="text-sm font-medium flex items-center gap-2">
              إشعارات المبيعات الجديدة
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                قريباً
              </span>
            </p>
            <p className="text-xs text-muted-foreground">إشعار عند كل عملية بيع جديدة — سيُفعَّل في تحديث قادم</p>
          </div>
          <Switch
            checked={false}
            disabled
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  children,
  full,
}: {
  label: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="space-y-1.5">
        <Label>{label}</Label>
        {children}
      </div>
    </div>
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
