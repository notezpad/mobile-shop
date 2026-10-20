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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { toast } from 'sonner'

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
}

const ACTION_LABELS: Record<string, string> = {
  'settings.update': 'تعديل إعدادات المنصة',
  'settings.tracking_update': 'تعديل إعدادات التتبع',
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="size-4 text-primary" />
          سجل نشاط الأدمن
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {notReady && (
          <p className="text-xs text-amber-600">
            جدول السجل غير موجود بعد — شغّل migration ‎20261020_audit_log‎.
          </p>
        )}
        {!loading && items.length === 0 && !notReady && (
          <p className="text-xs text-muted-foreground">لا توجد عمليات مسجّلة بعد.</p>
        )}
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="py-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ACTION_LABELS[it.action] ?? it.action}</span>
                <span className="text-muted-foreground" dir="ltr">
                  {new Date(it.createdAt).toLocaleString('ar-EG')}
                </span>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-x-3" dir="ltr">
                <span>{it.actorEmail ?? '—'}</span>
                {it.targetId && <span>{it.targetType}: {it.targetId}</span>}
              </div>
              {it.details && (
                <div className="text-[11px] text-muted-foreground break-all" dir="ltr">
                  {it.details}
                </div>
              )}
            </li>
          ))}
        </ul>
        {loading && <Skeleton className="h-16 w-full" />}
        {cursor && !loading && (
          <Button variant="outline" size="sm" onClick={() => load(cursor)}>
            عرض المزيد
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminSettingsView() {
  const [data, setData] = React.useState<Settings | null>(null)
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
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const update = (key: keyof Settings, value: string) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      await api('/api/admin/settings', { method: 'PUT', body: data })
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
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
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Platform Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            معلومات المنصة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>اسم المنصة</Label>
            <Input
              value={data.platformName}
              onChange={(e) => update('platformName', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>بريد الدعم الفني</Label>
              <div className="relative">
                <Mail className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={data.supportEmail}
                  onChange={(e) => update('supportEmail', e.target.value)}
                  className="pr-9"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>هاتف الدعم</Label>
              <div className="relative">
                <Phone className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={data.supportPhone}
                  onChange={(e) => update('supportPhone', e.target.value)}
                  className="pr-9"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>رابط الموقع</Label>
            <Input
              value={data.websiteUrl}
              onChange={(e) => update('websiteUrl', e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>رابط الشعار (URL)</Label>
            <Input
              value={data.logoUrl}
              onChange={(e) => update('logoUrl', e.target.value)}
              dir="ltr"
              placeholder="/logo.svg"
            />
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" />
            روابط التواصل الاجتماعي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>فيسبوك</Label>
            <div className="relative">
              <Facebook className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={data.facebookUrl}
                onChange={(e) => update('facebookUrl', e.target.value)}
                className="pr-9"
                dir="ltr"
                placeholder="https://facebook.com/..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>تويتر / X</Label>
            <div className="relative">
              <Twitter className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={data.twitterUrl}
                onChange={(e) => update('twitterUrl', e.target.value)}
                className="pr-9"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>إنستجرام</Label>
            <div className="relative">
              <Instagram className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={data.instagramUrl}
                onChange={(e) => update('instagramUrl', e.target.value)}
                className="pr-9"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>واتساب</Label>
            <div className="relative">
              <MessageCircle className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={data.whatsappUrl}
                onChange={(e) => update('whatsappUrl', e.target.value)}
                className="pr-9"
                dir="ltr"
                placeholder="https://wa.me/..."
              />
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>

      {/* PWA install banner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="size-4 text-primary" />
            بانر تثبيت التطبيق (PWA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>إظهار بانر "تثبيت التطبيق" للمستخدمين</Label>
              <p className="text-[11px] text-muted-foreground">
                يظهر فقط لمن لم يثبّت التطبيق بعد. من ثبّته لا يراه أبداً، سواء كان مفعّلاً أو لا.
              </p>
            </div>
            <Switch
              checked={data.pwaInstallBannerEnabled !== 'false'}
              onCheckedChange={(v) => update('pwaInstallBannerEnabled', v ? 'true' : 'false')}
            />
          </div>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Password change */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>كلمة المرور الحالية</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>كلمة المرور الجديدة</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="******"
              dir="ltr"
              autoComplete="new-password"
              minLength={10}
            />
            <p className="text-[11px] text-muted-foreground">10 أحرف على الأقل، وتحتوي على حروف وأرقام</p>
          </div>
          <Button onClick={changePassword} disabled={changingPwd} className="gap-1.5">
            {changingPwd ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            تغيير كلمة المرور
          </Button>
        </CardContent>
      </Card>

      <AuditLogCard />
    </div>
  )
}
