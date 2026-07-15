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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
}

export function AdminSettingsView() {
  const [data, setData] = React.useState<Settings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

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
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    setChangingPwd(true)
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { changePassword: true, newPassword },
      })
      toast.success('تم تغيير كلمة المرور')
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
            <Label>كلمة المرور الجديدة</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="******"
              dir="ltr"
              minLength={6}
            />
            <p className="text-[11px] text-muted-foreground">الحد الأدنى 6 أحرف</p>
          </div>
          <Button onClick={changePassword} disabled={changingPwd} className="gap-1.5">
            {changingPwd ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            تغيير كلمة المرور
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
