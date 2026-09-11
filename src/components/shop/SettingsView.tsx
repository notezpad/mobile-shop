'use client'

import * as React from 'react'
import { ImagePlus, Loader2, Save, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'

interface TenantData {
  id: string
  shopName: string
  phone: string | null
  address: string | null
  logoPath: string | null
  invoicePrefix: string
  commissionVodafoneCash: number
  commissionInstapay: number
  commissionFawry: number
  wholesaleEnabled: boolean
  retailEnabled: boolean
}

export function SettingsView() {
  const [data, setData] = React.useState<TenantData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')

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
              <Field label="عمولة فودافون كاش %">
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
              <Field label="عمولة فوري %">
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
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={!!data?.retailEnabled}
                onChange={(e) => update('retailEnabled', e.target.checked)}
              />
              <div>
                <div className="font-medium">تفعيل البيع بالقطاعي</div>
                <div className="text-xs text-muted-foreground mt-1">
                  السعر القطاعي (price في المنتج) يظهر كسعر بيع القطعة الواحدة.
                </div>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

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
