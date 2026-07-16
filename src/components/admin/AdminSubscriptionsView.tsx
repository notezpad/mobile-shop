'use client'

import * as React from 'react'
import {
  Plus,
  Pause,
  Trash2,
  CalendarPlus,
  Loader2,
  Calendar,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

interface SubRow {
  id: number
  tenantId: string
  shopName: string
  planId: number
  planCode: string
  planName: string
  status: string
  period: string
  amountPaid: number
  paymentMethod: string | null
  paymentNote: string | null
  startDate: string
  endDate: string
  createdAt: string
}

interface TenantLite {
  id: string
  shopName: string
}

interface PlanLite {
  id: number
  code: string
  name: string
  priceMonthly: number
  priceYearly: number
  trialDays: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'نشط', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    expired: { label: 'منتهي', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' },
    cancelled: { label: 'ملغي', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30' },
    grace: { label: 'سماح', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  }
  const cfg = map[status] ?? { label: status, cls: '' }
  return (
    <Badge variant="outline" className={`text-[11px] ${cfg.cls}`}>
      {cfg.label}
    </Badge>
  )
}

const PERIOD_LABEL: Record<string, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
  trial: 'تجريبي',
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستا باي',
  fawry: 'فوري',
  manual: 'يدوي',
  code: 'كود تفعيل',
}

export function AdminSubscriptionsView() {
  const [rows, setRows] = React.useState<SubRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [plans, setPlans] = React.useState<PlanLite[]>([])
  const [stats, setStats] = React.useState({ active: 0, trial: 0, expired: 0, cancelled: 0 })

  const [addOpen, setAddOpen] = React.useState(false)
  const [extendRow, setExtendRow] = React.useState<SubRow | null>(null)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (planFilter !== 'all') params.set('planId', planFilter)
      const data = await api<{ items: SubRow[] }>(`/api/admin/subscriptions?${params.toString()}`)
      setRows(data.items)
      const counts = { active: 0, trial: 0, expired: 0, cancelled: 0 }
      for (const r of data.items) {
        if (r.status === 'active' && r.period === 'trial') counts.trial++
        else if (r.status === 'active') counts.active++
        else if (r.status === 'expired') counts.expired++
        else if (r.status === 'cancelled') counts.cancelled++
      }
      setStats(counts)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الاشتراكات')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, planFilter])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: PlanLite[] }>('/api/admin/plans')
      setPlans(data.items)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    loadPlans()
  }, [loadPlans])

  const handlePause = async (row: SubRow) => {
    setBusyId(row.id)
    try {
      await api(`/api/admin/subscriptions/${row.id}`, {
        method: 'PUT',
        body: { action: 'status', status: 'cancelled' },
      })
      toast.success('تم إيقاف الاشتراك')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإيقاف')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setBusyId(deleteId)
    try {
      await api(`/api/admin/subscriptions/${deleteId}`, { method: 'DELETE' })
      toast.success('تم إلغاء الاشتراك')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">نشط</p>
              <p className="text-xl font-bold">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تجريبي</p>
              <p className="text-xl font-bold">{stats.trial}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-400">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">منتهي</p>
              <p className="text-xl font-bold">{stats.expired}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-slate-500/15 text-slate-700 dark:text-slate-400">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ملغي</p>
              <p className="text-xl font-bold">{stats.cancelled}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="expired">منتهي</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                  <SelectItem value="grace">سماح</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="الباقة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الباقات</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              تفعيل اشتراك
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>المحل</TableHead>
                    <TableHead className="w-28">الباقة</TableHead>
                    <TableHead className="w-24">الفترة</TableHead>
                    <TableHead className="w-32">البداية</TableHead>
                    <TableHead className="w-32">النهاية</TableHead>
                    <TableHead className="w-28">المبلغ</TableHead>
                    <TableHead className="w-32">طريقة الدفع</TableHead>
                    <TableHead className="w-28">الحالة</TableHead>
                    <TableHead className="w-32 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        لا توجد اشتراكات
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{r.shopName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{r.planName}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{PERIOD_LABEL[r.period] ?? r.period}</TableCell>
                        <TableCell className="text-xs">{formatShortDate(r.startDate)}</TableCell>
                        <TableCell className="text-xs">{formatShortDate(r.endDate)}</TableCell>
                        <TableCell className="text-xs">{formatCurrency(r.amountPaid)}</TableCell>
                        <TableCell className="text-xs">{r.paymentMethod ? (METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod) : '-'}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-emerald-600 hover:text-emerald-700"
                              title="تمديد"
                              disabled={busyId === r.id}
                              onClick={() => setExtendRow(r)}
                            >
                              <CalendarPlus className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-amber-600 hover:text-amber-700"
                              title="إيقاف"
                              disabled={busyId === r.id}
                              onClick={() => handlePause(r)}
                            >
                              <Pause className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:bg-destructive/10"
                              title="حذف"
                              disabled={busyId === r.id}
                              onClick={() => setDeleteId(r.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extend Dialog */}
      {extendRow && (
        <ExtendDialog
          row={extendRow}
          open={!!extendRow}
          onOpenChange={(o) => !o && setExtendRow(null)}
          onSaved={load}
        />
      )}

      {/* Add Subscription Dialog */}
      <AddSubscriptionDialog
        plans={plans}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={load}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إلغاء الاشتراك</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء الاشتراك (وضعه كملغي) ولن يتم حذفه فعلياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              نعم، ألغِ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------------- Extend Dialog ---------------- */

function ExtendDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: SubRow
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [period, setPeriod] = React.useState<'monthly' | 'yearly'>('monthly')
  const [amountPaid, setAmountPaid] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState('manual')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/admin/subscriptions/${row.id}`, {
        method: 'PUT',
        body: {
          action: 'extend',
          period,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
          paymentMethod,
        },
      })
      toast.success('تم تمديد الاشتراك')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التمديد')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تمديد الاشتراك</DialogTitle>
          <DialogDescription>{row.shopName} — {row.planName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الفترة</Label>
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">شهر (30 يوم)</SelectItem>
                <SelectItem value="yearly">سنة (365 يوم)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ المدفوع</Label>
            <Input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="0"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">كاش</SelectItem>
                <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                <SelectItem value="instapay">إنستا باي</SelectItem>
                <SelectItem value="fawry">فوري</SelectItem>
                <SelectItem value="manual">يدوي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            <CalendarPlus className="size-4" />
            تمديد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Add Subscription Dialog ---------------- */

function AddSubscriptionDialog({
  plans,
  open,
  onOpenChange,
  onSaved,
}: {
  plans: PlanLite[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [tenants, setTenants] = React.useState<TenantLite[]>([])
  const [tenantId, setTenantId] = React.useState('')
  const [planId, setPlanId] = React.useState('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [amountPaid, setAmountPaid] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState('manual')
  const [paymentNote, setPaymentNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      api<{ items: TenantLite[] }>(`/api/admin/tenants`).then((d) => {
        setTenants(d.items)
      }).catch(() => {})
      setPlanId(plans.find((p) => p.code === 'pro')?.id?.toString() ?? '')
      setTenantId('')
      setPeriod('monthly')
      setAmountPaid('')
      setPaymentMethod('manual')
      setPaymentNote('')
    }
  }, [open, plans])

  const save = async () => {
    if (!tenantId || !planId) {
      toast.error('يرجى اختيار المحل والباقة')
      return
    }
    setSaving(true)
    try {
      await api('/api/admin/subscriptions', {
        method: 'POST',
        body: {
          tenantId,
          planId: Number(planId),
          period,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
          paymentMethod,
          paymentNote,
        },
      })
      toast.success('تم تفعيل الاشتراك')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التفعيل')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تفعيل اشتراك جديد</DialogTitle>
          <DialogDescription>إنشاء اشتراك لمحل موجود</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>المحل *</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المحل" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.shopName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الباقة *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الباقة" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الفترة</Label>
              <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="yearly">سنوي</SelectItem>
                  <SelectItem value="trial">تجريبي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ المدفوع</Label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">كاش</SelectItem>
                  <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                  <SelectItem value="instapay">إنستا باي</SelectItem>
                  <SelectItem value="fawry">فوري</SelectItem>
                  <SelectItem value="manual">يدوي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة</Label>
            <Textarea
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Plus className="size-4" />
            تفعيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
