'use client'

import * as React from 'react'
import {
  Save,
  Loader2,
  KeyRound,
  Globe,
  Mail,
  Phone,
  Facebook,
  Twitter,
  Instagram,
  MessageCircle,
  Smartphone,
  ScrollText,
  CalendarClock,
  BellRing,
  Settings2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Send,
  Braces,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { TEMPLATE_KINDS, TEMPLATE_LABELS, TEMPLATE_VARS, TEMPLATE_DEFAULTS, tplKey, EMAIL_ENABLED_KEY } from '@/lib/message-templates'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Settings {
  platformName: string
  supportEmail: string
  supportPhone: string
  websiteUrl: string
  logoUrl: string
  facebookUrl: string
  twitterUrl: string
  instagramUrl: string
  whatsappUrl: string
  pwaInstallBannerEnabled: string
  subscriptionGraceDays: string
  renewalReminderDays: string
  notificationRetentionDays: string
  [key: string]: string
}

const ACTION_LABELS: Record<string, string> = {
  'settings.update': 'تعديل إعدادات المنصة',
  'settings.tracking_update': 'تعديل إعدادات التتبع',
  'settings.test_email': 'إرسال إيميل تجريبي',
  'auth.password_change': 'تغيير كلمة مرور الأدمن',
  'auth.admin_login': 'تسجيل دخول الأدمن',
  'impersonate.start': 'بدء انتحال محل',
  'impersonate.stop': 'إنهاء انتحال محل',
  'tenant.update': 'تعديل بيانات محل',
  'tenant.status_change': 'تغيير حالة محل',
  'tenant.cancel': 'إلغاء محل',
  'tenant.delete_permanent': 'حذف محل نهائيًا',
  'tenant.purge_fake': 'حذف حسابات وهمية',
  'subscription.assign_plan': 'تعيين باقة لمحل',
  'subscription.extend': 'تمديد اشتراك',
  'subscription.status_change': 'تغيير حالة اشتراك',
  'subscription.cancel': 'إلغاء اشتراك',
  'plan.create': 'إنشاء باقة',
  'plan.update': 'تعديل باقة',
  'plan.deactivate': 'تعطيل باقة',
  'plan.delete': 'حذف باقة',
  'code.create': 'إنشاء أكواد تفعيل',
  'code.delete': 'حذف كود تفعيل',
}


/* ═════════════════════════ UI helpers (نفس لغة باقي صفحات الأدمن) ═════════════════════════ */

type Tone = 'primary' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6'

const TONES: Record<Tone, string> = {
  primary: 'bg-primary/12 text-primary ring-primary/20',
  c1: 'bg-chart-1/15 text-chart-1 ring-chart-1/20',
  c2: 'bg-chart-2/15 text-chart-2 ring-chart-2/20',
  c3: 'bg-chart-3/15 text-chart-3 ring-chart-3/20',
  c4: 'bg-chart-4/15 text-chart-4 ring-chart-4/20',
  c5: 'bg-chart-5/15 text-chart-5 ring-chart-5/20',
  c6: 'bg-chart-6/15 text-chart-6 ring-chart-6/20',
}

function SectionCard({
  id,
  icon: Icon,
  tone,
  title,
  desc,
  aside,
  className,
  bodyClassName,
  children,
}: {
  id?: string
  icon: React.ComponentType<{ className?: string }>
  tone: Tone
  title: string
  desc?: string
  aside?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <Card
      id={id}
      className={cn('scroll-mt-4 gap-0 overflow-hidden py-0 shadow-sm animate-in-up', className)}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b bg-muted/25 px-4 py-3 sm:px-5 [.border-b]:pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset', TONES[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-black">{title}</CardTitle>
            {desc && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{desc}</p>}
          </div>
        </div>
        {aside}
      </CardHeader>
      <CardContent className={cn('flex-1 space-y-4 p-4 sm:p-5', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[12px] font-bold">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function IconInput({
  icon: Icon,
  ...props
}: { icon: React.ComponentType<{ className?: string }> } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute right-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...props} className={cn('h-10 pr-9', props.className)} />
    </div>
  )
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string
  desc: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border p-3.5 transition-colors',
        checked ? 'border-primary/25 bg-primary/[0.04]' : 'bg-muted/20',
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] font-bold">{title}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

function StatusChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold backdrop-blur',
        on
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
          : 'border-white/10 bg-white/5 text-slate-300',
      )}
    >
      <span className={cn('size-1.5 rounded-full', on ? 'bg-emerald-400' : 'bg-slate-400')} aria-hidden />
      {label}
    </span>
  )
}

const NAV: Array<{ id: string; label: string }> = [
  { id: 'st-platform', label: 'المنصة' },
  { id: 'st-social', label: 'التواصل' },
  { id: 'st-subscription', label: 'الاشتراكات' },
  { id: 'st-email', label: 'الإيميلات' },
  { id: 'st-security', label: 'الأمان' },
  { id: 'st-audit', label: 'السجل' },
]

const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

function actionTone(action: string): string {
  const p = action.split('.')[0]
  switch (p) {
    case 'auth': return 'bg-chart-3'
    case 'tenant': return 'bg-chart-6'
    case 'subscription': return 'bg-chart-1'
    case 'plan': return 'bg-chart-4'
    case 'code': return 'bg-chart-2'
    case 'impersonate': return 'bg-chart-5'
    default: return 'bg-primary'
  }
}

interface AuditItem {
  id: number
  actorEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  details: string | null
  createdAt: string
}

function AuditLogCard() {
  const [items, setItems] = React.useState<AuditItem[]>([])
  const [cursor, setCursor] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [notReady, setNotReady] = React.useState(false)

  const load = React.useCallback(async (before?: number) => {
    setLoading(true)
    try {
      const d = await api<{ items: AuditItem[]; nextCursor: number | null; notReady?: boolean }>(
        `/api/admin/audit?limit=30${before ? `&before=${before}` : ''}`
      )
      setNotReady(Boolean(d.notReady))
      setItems((prev) => (before ? [...prev, ...d.items] : d.items))
      setCursor(d.nextCursor)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل سجل النشاط')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <SectionCard
      id="st-audit"
      icon={ScrollText}
      tone="c4"
      title="سجل نشاط الأدمن"
      desc="آخر العمليات الحساسة على المنصة"
      className="xl:col-span-7"
      bodyClassName="p-0 sm:p-0"
    >
      {notReady && (
        <p className="m-4 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
          جدول السجل غير موجود بعد — شغّل migration ‎20261020_audit_log‎.
        </p>
      )}
      {!loading && items.length === 0 && !notReady && (
        <div className="py-12 text-center">
          <ScrollText className="mx-auto mb-2 size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-[12px] text-muted-foreground">لا توجد عمليات مسجّلة بعد.</p>
        </div>
      )}
      <ul className="max-h-[440px] divide-y divide-border/60 overflow-y-auto overscroll-contain">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 sm:px-5">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', actionTone(it.action))} aria-hidden />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="text-[12.5px] font-bold">{ACTION_LABELS[it.action] ?? it.action}</span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">
                  {new Date(it.createdAt).toLocaleString('ar-EG')}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground" dir="ltr">
                <span>{it.actorEmail ?? '—'}</span>
                {it.targetId && <span>{it.targetType}: {it.targetId}</span>}
              </div>
              {it.details && (
                <div className="break-all text-[10.5px] text-muted-foreground/80" dir="ltr">
                  {it.details}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {loading && <div className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></div>}
      {cursor && !loading && (
        <div className="border-t p-3 text-center">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => load(cursor)}>
            عرض المزيد
          </Button>
        </div>
      )}
    </SectionCard>
  )
}

export function AdminSettingsView() {
  const [data, setData] = React.useState<Settings | null>(null)
  const [initial, setInitial] = React.useState<string>('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [changingPwd, setChangingPwd] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<Settings>('/api/admin/settings')
      setData(d)
      setInitial(JSON.stringify(d))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const dirty = data !== null && JSON.stringify(data) !== initial

  const update = (key: string, value: string) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      await api('/api/admin/settings', { method: 'PUT', body: data })
      setInitial(JSON.stringify(data))
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    if (initial) setData(JSON.parse(initial))
  }

  const [testing, setTesting] = React.useState<string | null>(null)
  const sendTest = async (kind: string) => {
    setTesting(kind)
    try {
      const r: any = await api('/api/admin/settings/test-email', { method: 'POST', body: { kind } })
      toast.success(`تم إرسال رسالة تجريبية إلى ${r?.to ?? 'إيميلك'}`)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإرسال')
    } finally {
      setTesting(null)
    }
  }

  const changePassword = async () => {
    if (!currentPassword) {
      toast.error('أدخل كلمة المرور الحالية')
      return
    }
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      toast.error('كلمة المرور الجديدة: 10 أحرف على الأقل وتحتوي حروف وأرقام')
      return
    }
    setChangingPwd(true)
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { changePassword: true, currentPassword, newPassword },
      })
      toast.success('تم تغيير كلمة المرور — تم تسجيل الخروج من باقي الأجهزة')
      setCurrentPassword('')
      setNewPassword('')
    } catch (e: any) {
      toast.error(e?.message || 'فشل التغيير')
    } finally {
      setChangingPwd(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Skeleton className="h-72 rounded-xl xl:col-span-7" />
          <Skeleton className="h-72 rounded-xl xl:col-span-5" />
          <Skeleton className="h-56 rounded-xl xl:col-span-4" />
          <Skeleton className="h-56 rounded-xl xl:col-span-4" />
          <Skeleton className="h-56 rounded-xl xl:col-span-4" />
        </div>
      </div>
    )
  }

  const emailOn = data[EMAIL_ENABLED_KEY] !== 'false'
  const pwaOn = data.pwaInstallBannerEnabled !== 'false'
  const graceDays = data.subscriptionGraceDays ?? '0'

  return (
    <div className="space-y-4" dir="rtl">
      {/* ═══ الهيرو ═══ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-50 shadow-lg shadow-slate-950/20 dark:border-slate-700/40 dark:shadow-none">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div aria-hidden className="absolute -top-24 start-1/4 size-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-28 end-10 size-64 rounded-full bg-sky-400/10 blur-3xl" />
        <Settings2
          aria-hidden
          className="absolute -bottom-12 -start-10 size-52 -rotate-12 text-white/[0.04]"
          strokeWidth={1.2}
        />

        <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0 space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-[11px] font-bold text-indigo-200 backdrop-blur">
              <ShieldCheck className="size-3.5" />
              لوحة الأدمن الأعلى
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">إعدادات المنصة</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-300/80">
                بيانات المنصة، الاشتراكات، الإيميلات والأمان — كل التعديلات بتتحفظ مرة واحدة من شريط الحفظ.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip on={emailOn} label={emailOn ? 'الإيميلات التلقائية: مفعّلة' : 'الإيميلات التلقائية: متوقفة'} />
              <StatusChip on={pwaOn} label={pwaOn ? 'بانر التطبيق: ظاهر' : 'بانر التطبيق: مخفي'} />
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-slate-200 backdrop-blur">
                <CalendarClock className="size-3.5 text-sky-300" />
                فترة السماح: <b className="font-mono tabular-nums">{graceDays}</b> يوم
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {dirty && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 text-[11px] font-bold text-amber-200">
                <span className="size-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden />
                تغييرات غير محفوظة
              </span>
            )}
            <Button
              variant="outline"
              onClick={load}
              className="h-10 gap-1.5 rounded-xl border-white/15 bg-white/5 px-3.5 text-xs font-bold text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              تحديث
            </Button>
            <Button
              onClick={save}
              disabled={saving || !dirty}
              className="h-10 gap-1.5 rounded-xl bg-gradient-to-l from-indigo-400 to-sky-400 px-5 font-black text-slate-950 shadow-[0_10px_26px_-10px_rgba(99,102,241,0.8)] transition-all hover:from-indigo-300 hover:to-sky-300 active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ الإعدادات
            </Button>
          </div>
        </div>

        {/* شريط تنقل سريع */}
        <nav
          aria-label="أقسام الإعدادات"
          className="relative flex gap-1.5 overflow-x-auto border-t border-white/10 bg-black/20 px-4 py-2.5 [scrollbar-width:none] sm:px-7"
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => goTo(n.id)}
              className="shrink-0 rounded-full px-3 py-1 text-[11.5px] font-bold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {n.label}
            </button>
          ))}
        </nav>
      </section>

      {/* ═══ الشبكة — بعرض الصفحة بالكامل ═══ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* معلومات المنصة */}
        <SectionCard
          id="st-platform"
          icon={Globe}
          tone="primary"
          title="معلومات المنصة"
          desc="الاسم، بيانات الدعم، الموقع والشعار"
          className="xl:col-span-7"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="اسم المنصة">
              <Input
                className="h-10"
                value={data.platformName}
                onChange={(e) => update('platformName', e.target.value)}
              />
            </Field>
            <Field label="رابط الموقع">
              <IconInput
                icon={Globe}
                value={data.websiteUrl}
                onChange={(e) => update('websiteUrl', e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="بريد الدعم الفني">
              <IconInput
                icon={Mail}
                value={data.supportEmail}
                onChange={(e) => update('supportEmail', e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="هاتف الدعم">
              <IconInput
                icon={Phone}
                value={data.supportPhone}
                onChange={(e) => update('supportPhone', e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="رابط الشعار (URL)" className="md:col-span-2">
              <Input
                className="h-10"
                value={data.logoUrl}
                onChange={(e) => update('logoUrl', e.target.value)}
                dir="ltr"
                placeholder="/logo.svg"
              />
            </Field>
          </div>
        </SectionCard>

        {/* التواصل الاجتماعي */}
        <SectionCard
          id="st-social"
          icon={MessageCircle}
          tone="c3"
          title="روابط التواصل الاجتماعي"
          desc="بتظهر في فوتر الموقع وصفحات التواصل"
          className="xl:col-span-5"
        >
          <div className="grid grid-cols-1 gap-4">
            <Field label="فيسبوك">
              <IconInput
                icon={Facebook}
                value={data.facebookUrl}
                onChange={(e) => update('facebookUrl', e.target.value)}
                dir="ltr"
                placeholder="https://facebook.com/..."
              />
            </Field>
            <Field label="تويتر / X">
              <IconInput
                icon={Twitter}
                value={data.twitterUrl}
                onChange={(e) => update('twitterUrl', e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="إنستجرام">
              <IconInput
                icon={Instagram}
                value={data.instagramUrl}
                onChange={(e) => update('instagramUrl', e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="واتساب">
              <IconInput
                icon={MessageCircle}
                value={data.whatsappUrl}
                onChange={(e) => update('whatsappUrl', e.target.value)}
                dir="ltr"
                placeholder="https://wa.me/..."
              />
            </Field>
          </div>
        </SectionCard>

        {/* الاشتراكات */}
        <SectionCard
          id="st-subscription"
          icon={CalendarClock}
          tone="c1"
          title="إعدادات الاشتراك"
          desc="فترة السماح وتذكيرات التجديد"
          className="xl:col-span-6"
          bodyClassName="grid grid-cols-1 content-start gap-4 space-y-0 md:grid-cols-2"
        >
          <Field
            label="فترة السماح بعد انتهاء الاشتراك (أيام)"
            hint="خلال هذه المدة يفضل النظام شغّالًا مع تنبيه للمحل. 0 = يتوقف فور الانتهاء. الحد الأقصى 30 يومًا. التغيير قد يستغرق حتى 5 دقائق ليظهر."
          >
            <Input
              type="number"
              min={0}
              max={30}
              value={data.subscriptionGraceDays ?? '0'}
              onChange={(e) => update('subscriptionGraceDays', e.target.value)}
              dir="ltr"
              className="h-10 max-w-[140px]"
            />
          </Field>
          <Field
            label="أيام تذكير التجديد قبل الانتهاء"
            hint={
              <>
                أرقام مفصولة بفواصل (حتى 5)، مثال <span dir="ltr">7,3,1</span> = إشعار قبل الانتهاء بـ 7 أيام ثم 3 ثم يوم.
              </>
            }
          >
            <Input
              value={data.renewalReminderDays ?? '7'}
              onChange={(e) => update('renewalReminderDays', e.target.value)}
              dir="ltr"
              placeholder="7,3,1"
              className="h-10 max-w-[220px]"
            />
          </Field>
        </SectionCard>

        {/* الإشعارات */}
        <SectionCard
          icon={BellRing}
          tone="c2"
          title="الإشعارات الداخلية"
          desc="مدة الاحتفاظ بالإشعارات"
          className="xl:col-span-3"
        >
          <Field
            label="مدة الاحتفاظ (أيام)"
            hint="الإشعارات الأقدم من المدة دي بتتمسح تلقائيًا لكل المحلات (الحد الأدنى 7 أيام، الافتراضي 30). الحذف بيتم تدريجيًا مع استخدام المحلات للنظام."
          >
            <Input
              type="number"
              min={7}
              max={365}
              value={data.notificationRetentionDays ?? '30'}
              onChange={(e) => update('notificationRetentionDays', e.target.value)}
              dir="ltr"
              className="h-10 max-w-[140px]"
            />
          </Field>
        </SectionCard>

        {/* PWA */}
        <SectionCard
          icon={Smartphone}
          tone="c6"
          title="بانر تثبيت التطبيق (PWA)"
          desc="ظهور بانر التثبيت للمستخدمين"
          className="xl:col-span-3"
        >
          <ToggleRow
            title='إظهار بانر "تثبيت التطبيق"'
            desc="يظهر فقط لمن لم يثبّت التطبيق بعد. من ثبّته لا يراه أبداً، سواء كان مفعّلاً أو لا."
            checked={pwaOn}
            onChange={(v) => update('pwaInstallBannerEnabled', v ? 'true' : 'false')}
          />
        </SectionCard>

        {/* الإيميلات — بعرض الصفحة */}
        <SectionCard
          id="st-email"
          icon={Mail}
          tone="c5"
          title="رسائل الإيميل (Resend)"
          desc="قوالب الرسائل التلقائية والمتغيرات المتاحة"
          className="xl:col-span-12"
        >
          <ToggleRow
            title="إرسال الإيميلات التلقائية"
            desc="ترحيب عند التسجيل، تذكير التجديد، وانتهاء الاشتراك. محتاج مفتاح RESEND_API_KEY كـ Secret في الـ Worker."
            checked={emailOn}
            onChange={(v) => update(EMAIL_ENABLED_KEY, v ? 'true' : 'false')}
          />

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed bg-muted/20 px-3 py-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
              <Braces className="size-3.5" aria-hidden />
              المتغيرات:
            </span>
            {TEMPLATE_VARS.map((v) => (
              <code
                key={v}
                dir="ltr"
                className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset ring-border"
              >{`{${v}}`}</code>
            ))}
            <span className="text-[11px] text-muted-foreground">— لو مسحت النص بيرجع للنص الافتراضي.</span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {TEMPLATE_KINDS.map((kind) => (
              <div key={kind} className="flex flex-col gap-2.5 rounded-xl border bg-muted/15 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-chart-5/15 text-chart-5 ring-1 ring-inset ring-chart-5/20">
                    <Mail className="size-3.5" aria-hidden />
                  </span>
                  <Label className="text-[13px] font-black">{TEMPLATE_LABELS[kind]}</Label>
                </div>
                <Input
                  className="h-10 bg-background"
                  value={data[tplKey(kind, 'subject')] ?? ''}
                  onChange={(e) => update(tplKey(kind, 'subject'), e.target.value.replace(/[\r\n]/g, ' '))}
                  placeholder={TEMPLATE_DEFAULTS[tplKey(kind, 'subject')]}
                  maxLength={150}
                />
                <Textarea
                  className="min-h-[140px] flex-1 bg-background"
                  value={data[tplKey(kind, 'body')] ?? ''}
                  onChange={(e) => update(tplKey(kind, 'body'), e.target.value)}
                  placeholder={TEMPLATE_DEFAULTS[tplKey(kind, 'body')]}
                  rows={6}
                  maxLength={2000}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={testing !== null}
                  onClick={() => sendTest(kind)}
                  className="h-9 gap-1.5 self-start rounded-lg text-[11.5px]"
                >
                  {testing === kind ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  إرسال تجربة لإيميلي (احفظ أولًا)
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* الأمان */}
        <SectionCard
          id="st-security"
          icon={KeyRound}
          tone="c4"
          title="تغيير كلمة المرور"
          desc="بيسجّل خروج من باقي الأجهزة"
          className="xl:col-span-5"
        >
          <Field label="كلمة المرور الحالية">
            <Input
              type="password"
              className="h-10"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
            />
          </Field>
          <Field label="كلمة المرور الجديدة" hint="10 أحرف على الأقل، وتحتوي على حروف وأرقام">
            <Input
              type="password"
              className="h-10"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="******"
              dir="ltr"
              autoComplete="new-password"
              minLength={10}
            />
          </Field>
          <Button onClick={changePassword} disabled={changingPwd} className="h-10 gap-1.5 rounded-xl font-bold">
            {changingPwd ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            تغيير كلمة المرور
          </Button>
        </SectionCard>

        <AuditLogCard />
      </div>

      {/* ═══ شريط الحفظ العائم — يظهر فقط مع وجود تغييرات ═══ */}
      {dirty && (
        <div className="sticky bottom-2 z-20 animate-in-up">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl border bg-card/95 p-2.5 ps-4 shadow-xl backdrop-blur">
            <span className="inline-flex items-center gap-2 text-[12px] font-bold">
              <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
              عندك تغييرات غير محفوظة
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={saving} className="h-9 gap-1.5 rounded-lg text-xs">
                <RotateCcw className="size-3.5" aria-hidden />
                تجاهل
              </Button>
              <Button onClick={save} disabled={saving} size="sm" className="h-9 gap-1.5 rounded-lg px-4 text-xs font-black">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
