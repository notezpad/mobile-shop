'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Marketing & Tracking — شاشة الإعدادات في لوحة الأدمن الأعلى
 * ═══════════════════════════════════════════════════════════════════
 *  - حالة كل منصة (Connected / Not Configured)
 *  - إعدادات Google (GA4 / Ads / GTM / Enhanced Conversions / Consent)
 *  - إعدادات Meta (Pixel + CAPI)
 *  - إعدادات TikTok (Pixel + Events API)
 *  - مفاتيح عامة (Tracking / Debug / Test / Consent Management)
 *  - سجل أحداث الاختبار (بدون أي بيانات حساسة)
 *
 * 🔒 الأسرار لا تُعرض أبداً — تظهر كنص Masked، وتُحفظ فقط عند إدخال
 * قيمة جديدة. حقل فارغ = بدون تغيير. زر «إزالة» يرسل __CLEAR__.
 */

import * as React from 'react'
import {
  Save, Loader2, Globe, BarChart3, Facebook, Music2, Megaphone,
  ShieldCheck, FlaskConical, Bug, ToggleLeft, Activity, RefreshCw,
  Eye, EyeOff, Trash2, CheckCircle2, XCircle, AlertTriangle, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ─── Types (توافق مع استجابة /api/admin/tracking) ────────────────────

interface TrackingSettings {
  general: { enabled: boolean; debugMode: boolean; testMode: boolean; consentManagement: boolean }
  google: {
    enabled: boolean
    ga4MeasurementId: string
    ga4ApiSecret: string
    ga4ApiSecretSet: boolean
    ga4ApiSecretMasked: string | null
    adsConversionId: string
    adsLabels: { registration: string; trial: string; purchase: string }
    gtmId: string
    useGtm: boolean
    enhancedConversions: boolean
    consentMode: boolean
  }
  meta: {
    enabled: boolean
    pixelId: string
    datasetId: string
    capiToken: string
    capiTokenSet: boolean
    capiTokenMasked: string | null
  }
  tiktok: {
    enabled: boolean
    pixelId: string
    eventsApiToken: string
    eventsApiTokenSet: boolean
    eventsApiTokenMasked: string | null
    testEventCode: string
  }
}

interface ProviderStatus {
  key: string
  label: string
  connected: boolean
  detail: string
}

interface TrackingEventRow {
  id: number
  eventId: string
  eventName: string
  provider: string
  source: string
  status: string
  error: string | null
  subscriptionId: number | null
  createdAt: string
}

interface Payload {
  config: TrackingSettings
  statuses: ProviderStatus[]
  events: TrackingEventRow[]
  stats: {
    sentCount: number
    failedCount: number
    lastEvent: { eventName: string; status: string; error: string | null; createdAt: string; provider: string } | null
  }
}

const SECRET_CLEAR = '__CLEAR__'

export function AdminTrackingView() {
  const [data, setData] = React.useState<Payload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [showSecret, setShowSecret] = React.useState<Record<string, boolean>>({})

  // حقول الأسرار المحلية — فارغة تعني "بدون تغيير"
  const [secrets, setSecrets] = React.useState({ ga4ApiSecret: '', capiToken: '', eventsApiToken: '' })
  const clearSecret = (k: keyof typeof secrets) => setSecrets((s) => ({ ...s, [k]: SECRET_CLEAR }))

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<Payload>('/api/admin/tracking')
      setData(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل إعدادات التتبع')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // deferred حتى لا نستدعي setState تزامنياً داخل الـ effect
    void Promise.resolve().then(load)
  }, [load])

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      const body: any = {
        general: data.config.general,
        google: {
          ...data.config.google,
          ga4ApiSecret: secrets.ga4ApiSecret === SECRET_CLEAR ? SECRET_CLEAR : secrets.ga4ApiSecret || '',
        },
        meta: {
          ...data.config.meta,
          capiToken: secrets.capiToken === SECRET_CLEAR ? SECRET_CLEAR : secrets.capiToken || '',
        },
        tiktok: {
          ...data.config.tiktok,
          eventsApiToken: secrets.eventsApiToken === SECRET_CLEAR ? SECRET_CLEAR : secrets.eventsApiToken || '',
        },
      }
      const res = await api<{ ok: boolean; warnings?: string[] }>('/api/admin/tracking', { method: 'PUT', body })
      if (res?.warnings?.length) {
        toast.warning(res.warnings[0])
      } else {
        toast.success('تم حفظ إعدادات التتبع')
      }
      setSecrets({ ga4ApiSecret: '', capiToken: '', eventsApiToken: '' })
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const cfg = data.config
  const setGeneral = (k: keyof TrackingSettings['general'], v: boolean) =>
    setData((p) => (p ? { ...p, config: { ...p.config, general: { ...p.config.general, [k]: v } } } : p))
  const setGoogle = (patch: Partial<TrackingSettings['google']>) =>
    setData((p) => (p ? { ...p, config: { ...p.config, google: { ...p.config.google, ...patch } } } : p))
  const setMeta = (patch: Partial<TrackingSettings['meta']>) =>
    setData((p) => (p ? { ...p, config: { ...p.config, meta: { ...p.config.meta, ...patch } } } : p))
  const setTikTok = (patch: Partial<TrackingSettings['tiktok']>) =>
    setData((p) => (p ? { ...p, config: { ...p.config, tiktok: { ...p.config.tiktok, ...patch } } } : p))

  const secretInput = (
    key: 'ga4ApiSecret' | 'capiToken' | 'eventsApiToken',
    opts: { set: boolean; masked: string | null; placeholder: string; onClear: () => void }
  ) => {
    const visible = showSecret[key]
    const cleared = secrets[key] === SECRET_CLEAR
    const hasValue = secrets[key] !== '' && !cleared
    return (
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            type={visible && hasValue ? 'text' : 'password'}
            dir="ltr"
            autoComplete="off"
            placeholder={cleared ? 'سيتم الإزالة عند الحفظ' : opts.set ? `محفوظ (${opts.masked ?? '••••'}) — اكتب قيمة جديدة للتغيير` : opts.placeholder}
            value={cleared ? '' : secrets[key]}
            onChange={(e) => setSecrets((s) => ({ ...s, [key]: e.target.value }))}
            className="pl-9"
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowSecret((v) => ({ ...v, [key]: !v[key] }))}
            title={visible ? 'إخفاء' : 'إظهار'}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {opts.set && !cleared && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="إزالة القيمة المحفوظة عند الحفظ"
            onClick={() => { opts.onClear(); toast.info('سيتم إزالة القيمة عند الحفظ') }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* ─── حالة المنصات ─── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.statuses.map((s) => (
          <Card key={s.key} className={s.connected ? 'border-emerald-500/40' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
                {s.connected ? (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"><CheckCircle2 className="size-3" /> متصل</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="size-3" /> غير مضبوط</Badge>
                )}
              </div>
              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" dir="ltr" title={s.detail}>{s.detail || '—'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── إحصائيات سريعة ─── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="flex items-center gap-1.5"><Activity className="size-4 text-primary" /> أحداث مرسلة: <b>{data.stats.sentCount}</b></span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="size-4 text-destructive" /> أحداث فاشلة: <b>{data.stats.failedCount}</b></span>
          {data.stats.lastEvent && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-4" /> آخر حدث:{' '}
              <b className="text-foreground">{data.stats.lastEvent.eventName}</b>
              <span className="text-xs">({data.stats.lastEvent.provider} · {new Date(data.stats.lastEvent.createdAt).toLocaleString('ar-EG')})</span>
            </span>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="settings">
        <TabsList className="grid w-full grid-cols-2 sm:w-96">
          <TabsTrigger value="settings">الإعدادات</TabsTrigger>
          <TabsTrigger value="events" className="gap-1"><FlaskConical className="size-3.5" /> سجل الأحداث</TabsTrigger>
        </TabsList>

        {/* ═══════════ الإعدادات ═══════════ */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {/* ─── عام ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ToggleLeft className="size-4 text-primary" />
                إعدادات عامة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SwitchRow
                label="التتبع (Tracking)"
                desc="المفتاح الرئيسي — عند الإيقاف يتوقف كل الإرسال لكل المنصات فوراً"
                checked={cfg.general.enabled}
                onChange={(v) => setGeneral('enabled', v)}
              />
              <SwitchRow
                label="Debug Mode"
                desc="تسجيل تفاصيل الأحداث في Console — للتشخيص فقط"
                checked={cfg.general.debugMode}
                onChange={(v) => setGeneral('debugMode', v)}
                icon={<Bug className="size-3.5" />}
              />
              <SwitchRow
                label="Test Mode"
                desc="أحداث اختبار — استخدم Test Events في مديري الأحداث للمنصات للتحقق"
                checked={cfg.general.testMode}
                onChange={(v) => setGeneral('testMode', v)}
                icon={<FlaskConical className="size-3.5" />}
              />
              <SwitchRow
                label="Consent Management"
                desc="احترام موافقة المستخدم (Google Consent Mode v2) قبل أي إرسال إعلاني"
                checked={cfg.general.consentManagement}
                onChange={(v) => setGeneral('consentManagement', v)}
                icon={<ShieldCheck className="size-3.5" />}
              />
            </CardContent>
          </Card>

          {/* ─── Google ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="size-4 text-primary" />
                Google
                <span className="ms-auto"><MiniSwitch checked={cfg.google.enabled} onChange={(v) => setGoogle({ enabled: v })} /></span>
              </CardTitle>
            </CardHeader>
            {cfg.google.enabled && (
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="GA4 Measurement ID" hint="من Analytics → Data Streams (G-XXXXXXXXXX)">
                    <Input dir="ltr" placeholder="G-XXXXXXXXXX" value={cfg.google.ga4MeasurementId} onChange={(e) => setGoogle({ ga4MeasurementId: e.target.value })} />
                  </Field>
                  <Field label="GA4 API Secret (Server-side)" hint="للإرسال عبر Measurement Protocol — سري، لا يُعرض">
                    {secretInput('ga4ApiSecret', { set: cfg.google.ga4ApiSecretSet, masked: cfg.google.ga4ApiSecretMasked, placeholder: 'غير مضبوط — اختياري', onClear: () => clearSecret('ga4ApiSecret') })}
                  </Field>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Google Ads Conversion ID" hint="من Ads → Conversion (AW-XXXXXXXXX)">
                    <Input dir="ltr" placeholder="AW-123456789" value={cfg.google.adsConversionId} onChange={(e) => setGoogle({ adsConversionId: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="تسمية التسجيل" hint="Signup">
                      <Input dir="ltr" placeholder="abc123" value={cfg.google.adsLabels.registration} onChange={(e) => setGoogle({ adsLabels: { ...cfg.google.adsLabels, registration: e.target.value } })} />
                    </Field>
                    <Field label="تسمية التجربة" hint="Trial">
                      <Input dir="ltr" placeholder="def456" value={cfg.google.adsLabels.trial} onChange={(e) => setGoogle({ adsLabels: { ...cfg.google.adsLabels, trial: e.target.value } })} />
                    </Field>
                    <Field label="تسمية الشراء" hint="Purchase">
                      <Input dir="ltr" placeholder="ghi789" value={cfg.google.adsLabels.purchase} onChange={(e) => setGoogle({ adsLabels: { ...cfg.google.adsLabels, purchase: e.target.value } })} />
                    </Field>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SwitchRow label="Google Tag / GTM" desc="تحميل حاوية GTM بدلاً من gtag مباشر" checked={cfg.google.useGtm} onChange={(v) => setGoogle({ useGtm: v })} />
                  {cfg.google.useGtm && (
                    <Field label="Google Tag ID" hint="GTM-XXXXXXX أو G-XXXX">
                      <Input dir="ltr" placeholder="GTM-XXXXXXX" value={cfg.google.gtmId} onChange={(e) => setGoogle({ gtmId: e.target.value })} />
                    </Field>
                  )}
                </div>
                <Separator />
                <SwitchRow label="Enhanced Conversions" desc="تطبيع وتهشئ email/phone (SHA-256) لتحسين دقة التحويلات — يُرسل فقط عند توفر البيانات قانونياً" checked={cfg.google.enhancedConversions} onChange={(v) => setGoogle({ enhancedConversions: v })} />
                <SwitchRow label="Google Consent Mode" desc="تفعيل أنماط الموافقة (ad_storage / analytics_storage / ad_user_data / ad_personalization)" checked={cfg.google.consentMode} onChange={(v) => setGoogle({ consentMode: v })} />
              </CardContent>
            )}
          </Card>

          {/* ─── Meta ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Facebook className="size-4 text-primary" />
                Meta (Pixel + Conversions API)
                <span className="ms-auto"><MiniSwitch checked={cfg.meta.enabled} onChange={(v) => setMeta({ enabled: v })} /></span>
              </CardTitle>
            </CardHeader>
            {cfg.meta.enabled && (
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Meta Pixel ID" hint="من Events Manager">
                    <Input dir="ltr" placeholder="123456789012345" value={cfg.meta.pixelId} onChange={(e) => setMeta({ pixelId: e.target.value })} />
                  </Field>
                  <Field label="Dataset ID" hint="اختياري — نفس الـ Pixel ID غالباً في الإعدادات الحديثة">
                    <Input dir="ltr" placeholder="نفس Pixel ID افتراضياً" value={cfg.meta.datasetId} onChange={(e) => setMeta({ datasetId: e.target.value })} />
                  </Field>
                </div>
                <Field label="Conversions API Access Token 🔒" hint="سري — يُستخدم من Backend فقط، يظهر Masked ولا يُعرض مطلقاً">
                  {secretInput('capiToken', { set: cfg.meta.capiTokenSet, masked: cfg.meta.capiTokenMasked, placeholder: 'أدخل توكن Conversions API', onClear: () => clearSecret('capiToken') })}
                </Field>
                <p className="text-[11px] text-muted-foreground">
                  عند التفعيل: الأحداث المهمة تُرسل Browser + Server بنفس event_id (Deduplication تلقائي في Events Manager).
                </p>
              </CardContent>
            )}
          </Card>

          {/* ─── TikTok ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Music2 className="size-4 text-primary" />
                TikTok (Pixel + Events API)
                <span className="ms-auto"><MiniSwitch checked={cfg.tiktok.enabled} onChange={(v) => setTikTok({ enabled: v })} /></span>
              </CardTitle>
            </CardHeader>
            {cfg.tiktok.enabled && (
              <CardContent className="space-y-3">
                <Field label="TikTok Pixel ID" hint="من Events Manager → Web Events">
                  <Input dir="ltr" placeholder="CXXXXXXXXXXXXXXXXXXX" value={cfg.tiktok.pixelId} onChange={(e) => setTikTok({ pixelId: e.target.value })} />
                </Field>
                <Field label="Events API Access Token 🔒" hint="سري — يُستخدم من Backend فقط">
                  {secretInput('eventsApiToken', { set: cfg.tiktok.eventsApiTokenSet, masked: cfg.tiktok.eventsApiTokenMasked, placeholder: 'أدخل توكن Events API', onClear: () => clearSecret('eventsApiToken') })}
                </Field>
                <Field label="Test Event Code (اختياري)" hint="من Events Manager → Test Events — يُرسل فقط عند تفعيل وضع الاختبار">
                  <Input dir="ltr" placeholder="TESTXXXX" value={cfg.tiktok.testEventCode} onChange={(e) => setTikTok({ testEventCode: e.target.value })} />
                </Field>
              </CardContent>
            )}
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-2 pb-4">
            <Button onClick={save} disabled={saving} className="min-w-36">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ الإعدادات
            </Button>
          </div>
        </TabsContent>

        {/* ═══════════ سجل الأحداث ═══════════ */}
        <TabsContent value="events" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              آخر 50 حدثاً من السيرفر — بدون بيانات عملاء حساسة. تشاهد هنا ما يصل لكل منصة عند تفعيل Debug/Test Mode.
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="size-4" /> تحديث
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {data.events.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  لا أحداث بعد — فعّل التتبع وأدخل معرفات المنصات ثم جرّب رحلة تسجيل/دفع حقيقية.
                </p>
              ) : (
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead className="text-right">الحدث</TableHead>
                        <TableHead className="text-right">المنصة</TableHead>
                        <TableHead className="text-right">Event ID</TableHead>
                        <TableHead className="text-right">المصدر</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">الوقت</TableHead>
                        <TableHead className="text-right">خطأ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.events.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">{ev.eventName}</TableCell>
                          <TableCell><ProviderBadge provider={ev.provider} /></TableCell>
                          <TableCell className="max-w-44 truncate font-mono text-[11px]" dir="ltr" title={ev.eventId}>{ev.eventId}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{ev.source === 'server' ? 'Server' : 'Browser'}</Badge></TableCell>
                          <TableCell><StatusBadge status={ev.status} /></TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleTimeString('ar-EG')}</TableCell>
                          <TableCell className="max-w-40 truncate text-xs text-destructive" title={ev.error ?? undefined}>{ev.error ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sub components ──────────────────────────────────────────────────

function SwitchRow({ label, desc, checked, onChange, icon }: {
  label: string
  desc?: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold">{icon}{label}</p>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function MiniSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <Switch checked={checked} onCheckedChange={onChange} />
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    meta: { label: 'Meta', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    tiktok: { label: 'TikTok', cls: 'bg-pink-500/15 text-pink-600 dark:text-pink-400' },
    ga4: { label: 'GA4', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    google_ads: { label: 'Ads', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  }
  const it = map[provider] ?? { label: provider, cls: 'bg-muted text-muted-foreground' }
  return <Badge className={`border-0 text-[10px] ${it.cls}`}>{it.label}</Badge>
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') return <Badge className="border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">تم الإرسال</Badge>
  if (status === 'failed') return <Badge className="border-0 bg-destructive/15 text-destructive">فشل</Badge>
  return <Badge variant="outline" className="text-muted-foreground">تجاهل</Badge>
}
