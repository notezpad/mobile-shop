'use client'

import * as React from 'react'
import {
  Plus,
  Pencil,
  Loader2,
  Save,
  CheckCircle2,
  Users,
  Package,
  Building2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'

interface PlanRow {
  id: number
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxProducts: number
  maxBranches: number
  trialDays: number
  features: string | null
  isActive: boolean
  sortOrder: number
  subscribersCount: number
  businessType?: string | null
  capabilities?: string | null
  enabledModules?: string | null
}

function parseFeatures(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join('\n')
    return raw
  } catch {
    return raw
  }
}

const CAPABILITIES_META: { key: string; label: string; desc: string }[] = [
  { key: 'multi_unit',       label: 'وحدات الجملة (دستة)',    desc: 'بيع بالجملة — نص دستة / دستة' },
  { key: 'collections',      label: 'الكوليكشن',              desc: 'تجميع المنتجات في كوليكشنات وخصم جماعي' },
]

function parseCaps(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch { /* ignore */ }
  return []
}

const PLAN_TONES: Record<string, string> = {
  trial: 'border-sky-500/40',
  pro: 'border-emerald-500/40',
  business: 'border-violet-500/40',
  enterprise: 'border-warning-subtle',
  // vertical plans
  'electronics-basic': 'border-emerald-500/40',
  'electronics-pro': 'border-violet-500/40',
  'fashion-basic': 'border-destructive-subtle',
  'fashion-pro': 'border-warning-subtle',
}

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  electronics: '📱 موبايل وكمبيوتر',
  fashion: '👗 ملابس وأحذية',
}

export function AdminPlansView() {
  const [plans, setPlans] = React.useState<PlanRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editPlan, setEditPlan] = React.useState<PlanRow | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ items: PlanRow[] }>('/api/admin/plans')
      setPlans(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الباقات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await api(`/api/admin/plans/${deleteId}`, { method: 'DELETE' })
      toast.success('تم إلغاء تفعيل الباقة')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">خطط الاشتراك ({plans.length})</h2>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          باقة جديدة
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const features = parseFeatures(p.features)
              .split('\n')
              .filter(Boolean)
            return (
              <Card
                key={p.id}
                className={`flex flex-col border-t-4 ${PLAN_TONES[p.code] ?? ''} ${
                  !p.isActive ? 'opacity-60' : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <p className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">
                        {p.code}
                      </p>
                      {p.businessType && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {BUSINESS_TYPE_LABEL[p.businessType] ?? p.businessType}
                        </p>
                      )}
                    </div>
                    {p.isActive ? (
                      <Badge variant="outline" className="bg-success-subtle text-success-subtle-foreground border-success-subtle">
                        مفعّلة
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                        معطّلة
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {p.description ?? ''}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {/* Pricing */}
                  <div className="rounded-md bg-muted/40 p-3 text-center">
                    {p.priceMonthly === 0 && p.priceYearly === 0 ? (
                      <p className="text-xl font-bold text-success-subtle-foreground">مجاناً</p>
                    ) : (
                      <>
                        <p className="text-xl font-bold">{formatCurrency(p.priceMonthly)}</p>
                        <p className="text-[10px] text-muted-foreground">شهرياً</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          سنوياً: {formatCurrency(p.priceYearly)}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                    <div className="rounded-md border p-1.5">
                      <Users className="mx-auto mb-0.5 size-3.5 text-muted-foreground" />
                      <p className="font-bold">
                        {p.maxUsers >= 999999 ? '∞' : p.maxUsers}
                      </p>
                      <p className="text-muted-foreground">مستخدم</p>
                    </div>
                    <div className="rounded-md border p-1.5">
                      <Package className="mx-auto mb-0.5 size-3.5 text-muted-foreground" />
                      <p className="font-bold">
                        {p.maxProducts >= 999999 ? '∞' : p.maxProducts}
                      </p>
                      <p className="text-muted-foreground">منتج</p>
                    </div>
                    <div className="rounded-md border p-1.5">
                      <Building2 className="mx-auto mb-0.5 size-3.5 text-muted-foreground" />
                      <p className="font-bold">{p.maxBranches}</p>
                      <p className="text-muted-foreground">فرع</p>
                    </div>
                  </div>

                  {/* Features */}
                  {features.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success-subtle-foreground" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Subscriber count + actions */}
                  <div className="mt-auto flex items-center justify-between border-t pt-2">
                    <span className="text-[11px] text-muted-foreground">
                      مشتركين: <span className="font-bold text-foreground">{p.subscribersCount}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setEditPlan(p)}
                    >
                      <Pencil className="size-3.5" />
                      تعديل
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit / Add Dialog */}
      {editPlan ? (
        <PlanDialog
          plan={editPlan}
          open={!!editPlan}
          onOpenChange={(o) => !o && setEditPlan(null)}
          onSaved={load}
        />
      ) : (
        <PlanDialog
          plan={null}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={load}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إلغاء الباقة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تعطيل الباقة (لن تظهر للعملاء الجدد). الاشتراكات الحالية ستستمر حتى انتهائها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              نعم، ألغِ التفعيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------------- Plan Dialog ---------------- */

function PlanDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: {
  plan: PlanRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const isEdit = !!plan
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [businessType, setBusinessType] = React.useState<'electronics' | 'fashion'>('electronics')
  const [priceMonthly, setPriceMonthly] = React.useState('0')
  const [priceYearly, setPriceYearly] = React.useState('0')
  const [maxUsers, setMaxUsers] = React.useState('1')
  const [maxProducts, setMaxProducts] = React.useState('50')
  const [maxBranches, setMaxBranches] = React.useState('1')
  const [trialDays, setTrialDays] = React.useState('0')
  const [features, setFeatures] = React.useState('')
  const [capabilities, setCapabilities] = React.useState<string[]>([])
  const [sortOrder, setSortOrder] = React.useState('0')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (plan) {
      setCode(plan.code)
      setName(plan.name)
      setDescription(plan.description ?? '')
      setBusinessType((plan.businessType as any) === 'fashion' ? 'fashion' : 'electronics')
      setPriceMonthly(String(plan.priceMonthly))
      setPriceYearly(String(plan.priceYearly))
      setMaxUsers(String(plan.maxUsers))
      setMaxProducts(String(plan.maxProducts))
      setMaxBranches(String(plan.maxBranches))
      setTrialDays(String(plan.trialDays))
      setFeatures(parseFeatures(plan.features))
      setCapabilities(parseCaps(plan.capabilities))
      setSortOrder(String(plan.sortOrder))
      setIsActive(plan.isActive)
    } else {
      setCode('')
      setName('')
      setDescription('')
      setBusinessType('electronics')
      setPriceMonthly('0')
      setPriceYearly('0')
      setMaxUsers('1')
      setMaxProducts('50')
      setMaxBranches('1')
      setTrialDays('0')
      setFeatures('')
      setCapabilities([])
      setSortOrder('0')
      setIsActive(true)
    }
  }, [plan, open])

  const save = async () => {
    if (!code || !name) {
      toast.error('الكود والاسم مطلوبان')
      return
    }
    setSaving(true)
    try {
      const payload = {
        code,
        name,
        description,
        businessType,
        capabilities: JSON.stringify(capabilities),
        priceMonthly: Number(priceMonthly) || 0,
        priceYearly: Number(priceYearly) || 0,
        maxUsers: Number(maxUsers) || 1,
        maxProducts: Number(maxProducts) || 50,
        maxBranches: Number(maxBranches) || 1,
        trialDays: Number(trialDays) || 0,
        features,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      }
      if (isEdit && plan) {
        await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: payload })
        toast.success('تم تحديث الباقة')
      } else {
        await api('/api/admin/plans', { method: 'POST', body: payload })
        toast.success('تم إنشاء الباقة')
      }
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل الباقة' : 'باقة جديدة'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `تعديل: ${plan?.name}` : 'أنشئ باقة اشتراك جديدة'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نوع النشاط التجاري</Label>
            <Select value={businessType} onValueChange={(v: any) => setBusinessType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="electronics">📱 موبايل وكمبيوتر</SelectItem>
                <SelectItem value="fashion">👗 ملابس وأحذية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الكود *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="electronics-pro"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="الباقة الاحترافية"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>الوصف</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>السعر الشهري (ج.م)</Label>
              <Input
                type="number"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>السعر السنوي (ج.م)</Label>
              <Input
                type="number"
                value={priceYearly}
                onChange={(e) => setPriceYearly(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>أقصى عدد مستخدمين</Label>
              <Input
                type="number"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>أقصى عدد منتجات</Label>
              <Input
                type="number"
                value={maxProducts}
                onChange={(e) => setMaxProducts(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>أقصى عدد فروع</Label>
              <Input
                type="number"
                value={maxBranches}
                onChange={(e) => setMaxBranches(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>أيام التجربة</Label>
              <Input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ترتيب العرض</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>المميزات (كل ميزة في سطر)</Label>
            <Textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              rows={5}
              placeholder="حتى 500 منتج&#10;5 مستخدمين&#10;تقارير متقدمة"
            />
          </div>
          <div className="space-y-1.5">
            <Label>الصلاحيات المتاحة (Capabilities)</Label>
            <div className="rounded-md border p-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CAPABILITIES_META.map((cap) => {
                const checked = capabilities.includes(cap.key)
                return (
                  <label
                    key={cap.key}
                    className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                      checked ? 'bg-success-subtle border-success-subtle' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Switch
                      checked={checked}
                      onCheckedChange={(on) =>
                        setCapabilities((prev) =>
                          on ? [...prev, cap.key] : prev.filter((c) => c !== cap.key)
                        )
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium leading-tight">{cap.label}</p>
                      <p className="text-[11px] text-muted-foreground">{cap.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="plan-active" />
            <Label htmlFor="plan-active">الباقة مفعّلة</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            {isEdit ? 'حفظ' : 'إنشاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
