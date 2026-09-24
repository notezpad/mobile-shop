'use client'

import * as React from 'react'
import {
  Ticket,
  Plus,
  Trash2,
  Copy,
  Download,
  Loader2,
  CheckCircle2,
  Search,
  UserCog,
  Clock,
  Calendar,
  Tag,
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
import { formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

interface CodeRow {
  id: number
  code: string
  planId: number
  planCode: string
  planName: string
  period: string
  status: string
  createdAt: string
  redeemedAt: string | null
  tenantId: string | null
  tenantName: string | null
  notes: string | null
  // 🛡️ 2026-09-21: new fields
  durationDays: number | null
  expiresAt: string | null
  assignedTenantId: string | null
  batchLabel: string | null
}

interface PlanLite {
  id: number
  code: string
  name: string
}

interface TenantLite {
  id: string
  shopName: string
}

const PERIOD_LABEL: Record<string, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
  trial: 'تجريبي',
}

export function AdminCodesView() {
  const [rows, setRows] = React.useState<CodeRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [plans, setPlans] = React.useState<PlanLite[]>([])
  const [tenants, setTenants] = React.useState<TenantLite[]>([])
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [search, setSearch] = React.useState('')

  const [genOpen, setGenOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [generated, setGenerated] = React.useState<string[] | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter === 'available') params.set('status', 'available')
      if (statusFilter === 'redeemed') params.set('status', 'redeemed')
      if (planFilter !== 'all') params.set('planId', planFilter)
      if (search.trim()) params.set('search', search.trim())
      const data = await api<{ items: CodeRow[] }>(`/api/admin/codes?${params.toString()}`)
      setRows(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الأكواد')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, planFilter, search])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: PlanLite[] }>('/api/admin/plans')
      setPlans(data.items)
    } catch {
      /* ignore */
    }
  }, [])

  // 🛡️ 2026-09-21: load tenants for the "assign to tenant" select
  const loadTenants = React.useCallback(async () => {
    try {
      const data = await api<{ items: TenantLite[] }>('/api/admin/tenants?status=')
      setTenants(data.items)
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

  React.useEffect(() => {
    loadTenants()
  }, [loadTenants])

  const stats = React.useMemo(() => {
    const available = rows.filter((r) => r.status === 'available').length
    const redeemed = rows.filter((r) => r.status === 'redeemed').length
    return { total: rows.length, available, redeemed }
  }, [rows])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await api(`/api/admin/codes/${deleteId}`, { method: 'DELETE' })
      toast.success('تم حذف الكود')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success('تم نسخ الكود')
  }

  const exportCSV = () => {
    const available = rows.filter((r) => r.status === 'available')
    if (available.length === 0) {
      toast.error('لا توجد أكواد متاحة للتصدير')
      return
    }
    const csv = ['Code,Plan,Period,DurationDays,ExpiresAt,AssignedTenant,Batch']
    for (const r of available) {
      const escaped = (s: string | null) => s ? `"${s.replace(/"/g, '""')}"` : ''
      csv.push(
        [
          r.code,
          escaped(r.planName),
          PERIOD_LABEL[r.period] ?? r.period,
          r.durationDays ?? '',
          r.expiresAt ? formatShortDate(r.expiresAt) : '',
          r.tenantName ? escaped(r.tenantName) : '',
          escaped(r.batchLabel),
        ].join(',')
      )
    }
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activation-codes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${available.length} كود`)
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Ticket className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الأكواد</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-subtle text-success-subtle-foreground">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">متاح</p>
              <p className="text-xl font-bold">{stats.available}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مستخدم</p>
              <p className="text-xl font-bold">{stats.redeemed}</p>
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
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="available">متاح</SelectItem>
                  <SelectItem value="redeemed">مستخدم</SelectItem>
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
              <div className="relative">
                <Search className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث بالكود/الملاحظات/الباتش..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:w-56 pr-8"
                />
              </div>
              <Button variant="outline" onClick={exportCSV} className="gap-1.5">
                <Download className="size-4" />
                تصدير المتاح (CSV)
              </Button>
            </div>
            <Button
              onClick={() => {
                setGenerated(null)
                setGenOpen(true)
              }}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              توليد أكواد
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>الكود</TableHead>
                    <TableHead className="w-32">الباقة</TableHead>
                    <TableHead className="w-24 text-center">المدة</TableHead>
                    <TableHead className="w-24 text-center">الحالة</TableHead>
                    <TableHead className="w-28 text-center">انتهاء الكود</TableHead>
                    <TableHead className="w-28 text-center">مخصص لـ</TableHead>
                    <TableHead className="w-24">الباتش</TableHead>
                    <TableHead className="w-28">تاريخ الإنشاء</TableHead>
                    <TableHead className="w-28">الاستخدام</TableHead>
                    <TableHead className="w-20 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        لا توجد أكواد
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => {
                      const codeExpired = r.expiresAt && new Date(r.expiresAt) < new Date()
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs" dir="ltr">
                                {r.code}
                              </code>
                              <button
                                onClick={() => copyCode(r.code)}
                                className="text-muted-foreground hover:text-foreground"
                                title="نسخ"
                              >
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{r.planName}</TableCell>
                          <TableCell className="text-center text-xs">
                            {r.durationDays ? (
                              <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
                                {r.durationDays} يوم
                              </Badge>
                            ) : (
                              PERIOD_LABEL[r.period] ?? r.period
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.status === 'available' ? (
                              <Badge variant="outline" className="bg-success-subtle text-success-subtle-foreground border-emerald-500/30">
                                متاح
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground border-warning-subtle">
                                مستخدم
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {r.expiresAt ? (
                              <span className={codeExpired ? 'text-red-600 font-semibold' : ''}>
                                {formatShortDate(r.expiresAt)}
                                {codeExpired && ' (منتهي)'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {r.assignedTenantId ? (
                              <span title={r.assignedTenantId}>
                                <UserCog className="inline size-3 ml-1 text-primary" />
                                مخصّص
                              </span>
                            ) : (
                              <span className="text-muted-foreground">عام</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.batchLabel ? (
                              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                                <Tag className="size-2.5" />
                                {r.batchLabel}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{formatShortDate(r.createdAt)}</TableCell>
                          <TableCell className="text-xs">
                            {r.redeemedAt ? (
                              <div>
                                <div>{formatShortDate(r.redeemedAt)}</div>
                                {r.tenantName && (
                                  <div className="text-muted-foreground text-[10px] truncate max-w-[120px]" title={r.tenantName}>
                                    {r.tenantName}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.status === 'available' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-destructive hover:bg-destructive/10"
                                title="حذف"
                                onClick={() => setDeleteId(r.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <GenerateCodesDialog
        plans={plans}
        tenants={tenants}
        open={genOpen}
        onOpenChange={setGenOpen}
        generated={generated}
        onGenerated={setGenerated}
        onSaved={load}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الكود</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الكود نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              نعم، احذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------------- Generate Dialog ---------------- */

function GenerateCodesDialog({
  plans,
  tenants,
  open,
  onOpenChange,
  generated,
  onGenerated,
  onSaved,
}: {
  plans: PlanLite[]
  tenants: TenantLite[]
  open: boolean
  onOpenChange: (o: boolean) => void
  generated: string[] | null
  onGenerated: (s: string[] | null) => void
  onSaved: () => void
}) {
  const [planId, setPlanId] = React.useState('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [quantity, setQuantity] = React.useState('5')
  const [notes, setNotes] = React.useState('')
  // 🛡️ 2026-09-21: new fields
  const [useCustomDuration, setUseCustomDuration] = React.useState(false)
  const [durationDays, setDurationDays] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [assignedTenantId, setAssignedTenantId] = React.useState('none')
  const [batchLabel, setBatchLabel] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setPlanId(plans.find((p) => p.code === 'electronics-basic')?.id?.toString() ?? plans[0]?.id?.toString() ?? '')
      setPeriod('monthly')
      setQuantity('5')
      setNotes('')
      setUseCustomDuration(false)
      setDurationDays('')
      setExpiresAt('')
      setAssignedTenantId('none')
      setBatchLabel('')
    }
  }, [open, plans])

  const generate = async () => {
    if (!planId) {
      toast.error('اختر الباقة')
      return
    }
    if (useCustomDuration) {
      const d = Number(durationDays)
      if (!d || d < 1 || d > 3650) {
        toast.error('مدة الكود يجب أن تكون بين 1 و 3650 يوم')
        return
      }
    }
    setSaving(true)
    try {
      const body: any = {
        planId: Number(planId),
        period,
        quantity: Number(quantity) || 1,
        notes,
      }
      if (useCustomDuration) body.durationDays = Number(durationDays)
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString()
      if (assignedTenantId !== 'none') body.assignedTenantId = assignedTenantId
      if (batchLabel.trim()) body.batchLabel = batchLabel.trim()

      const data = await api<{ codes: string[] }>('/api/admin/codes', {
        method: 'POST',
        body,
      })
      onGenerated(data.codes)
      toast.success(`تم توليد ${data.codes.length} كود`)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التوليد')
    } finally {
      setSaving(false)
    }
  }

  const exportGenerated = () => {
    if (!generated) return
    const csv = ['Code']
    for (const c of generated) csv.push(c)
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-codes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>توليد أكواد تفعيل</DialogTitle>
          <DialogDescription>
            سيتم توليد أكواد عشوائية بطول 12 حرف (بدون أحرف ملتبسة مثل 0/O أو 1/I).
            استخدم الخيارات المتقدمة لتخصيص مدة الكود أو تخصيصه لمحل معين.
          </DialogDescription>
        </DialogHeader>
        {generated ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 text-sm font-semibold text-success-subtle-foreground dark:text-success-subtle-foreground">
                ✅ تم توليد {generated.length} كود
              </p>
              <div className="max-h-48 overflow-y-auto">
                <pre className="font-mono text-xs" dir="ltr">
                  {generated.join('\n')}
                </pre>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={exportGenerated}>
                <Download className="size-4" />
                تصدير CSV
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  onGenerated(null)
                  onOpenChange(false)
                }}
              >
                تم
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
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
                  <Select value={period} onValueChange={(v: any) => setPeriod(v)} disabled={useCustomDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">شهري (30 يوم)</SelectItem>
                      <SelectItem value="yearly">سنوي (365 يوم)</SelectItem>
                      <SelectItem value="trial">تجريبي (14 يوم)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 🛡️ 2026-09-21: Custom duration override */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={useCustomDuration}
                    onChange={(e) => setUseCustomDuration(e.target.checked)}
                  />
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="size-3.5 text-primary" />
                    تخصيص مدة الكود (بالأيام)
                  </span>
                </label>
                {useCustomDuration && (
                  <div className="space-y-1.5 pl-6">
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      placeholder="مثال: 45 (ليوم 45 يوم بدلاً من 30)"
                      dir="ltr"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      عند التفعيل، يحصل المستخدم على اشتراك بالمدة المحددة بالأيام بدلاً من الفترة الشهرية/السنوية.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>العدد (1-100)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>تخصيص لمحل (اختياري)</Label>
                  <Select value={assignedTenantId} onValueChange={setAssignedTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="عام (أي محل)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عام (أي محل يقدر يفعّله)</SelectItem>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.shopName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  تاريخ انتهاء صلاحية الكود (اختياري)
                </Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  dir="ltr"
                />
                <p className="text-[11px] text-muted-foreground">
                  إذا حُدّد، لا يمكن تفعيل الكود بعد هذا التاريخ (حتى لو لم يُستخدم).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" />
                  تصنيف الباتش (اختياري)
                </Label>
                <Input
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="مثال: حملة ديسمبر 2026"
                />
                <p className="text-[11px] text-muted-foreground">
                  اسم يُميّز مجموعة الأكواد دي عن غيرها (للترتيب والبحث لاحقاً).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>ملاحظات داخلية</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: حملة تسويقية ديسمبر — تُرسل للعملاء عبر WhatsApp"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={generate} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                توليد
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
