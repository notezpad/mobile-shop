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
}

interface PlanLite {
  id: number
  code: string
  name: string
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
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')

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
      const data = await api<{ items: CodeRow[] }>(`/api/admin/codes?${params.toString()}`)
      setRows(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الأكواد')
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
    const csv = ['Code,Plan,Period']
    for (const r of available) {
      csv.push(`${r.code},${r.planName},${PERIOD_LABEL[r.period] ?? r.period}`)
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
            <div className="flex size-10 items-center justify-center rounded-lg bg-slate-500/15 text-slate-700 dark:text-slate-400">
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
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
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
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
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
      <Card>
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
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>الكود</TableHead>
                    <TableHead className="w-32">الباقة</TableHead>
                    <TableHead className="w-24">الفترة</TableHead>
                    <TableHead className="w-24">الحالة</TableHead>
                    <TableHead className="w-32">تاريخ الإنشاء</TableHead>
                    <TableHead className="w-32">تاريخ الاستخدام</TableHead>
                    <TableHead className="w-36">المحل المستخدم</TableHead>
                    <TableHead className="w-20 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        لا توجد أكواد
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
                        <TableCell className="text-xs">{PERIOD_LABEL[r.period] ?? r.period}</TableCell>
                        <TableCell>
                          {r.status === 'available' ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                              متاح
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              مستخدم
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatShortDate(r.createdAt)}</TableCell>
                        <TableCell className="text-xs">{r.redeemedAt ? formatShortDate(r.redeemedAt) : '-'}</TableCell>
                        <TableCell className="text-xs">{r.tenantName ?? '-'}</TableCell>
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
                    ))
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
  open,
  onOpenChange,
  generated,
  onGenerated,
  onSaved,
}: {
  plans: PlanLite[]
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
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setPlanId(plans.find((p) => p.code === 'pro')?.id?.toString() ?? '')
      setPeriod('monthly')
      setQuantity('5')
      setNotes('')
    }
  }, [open, plans])

  const generate = async () => {
    if (!planId) {
      toast.error('اختر الباقة')
      return
    }
    setSaving(true)
    try {
      const data = await api<{ codes: string[] }>('/api/admin/codes', {
        method: 'POST',
        body: {
          planId: Number(planId),
          period,
          quantity: Number(quantity) || 1,
          notes,
        },
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>توليد أكواد تفعيل</DialogTitle>
          <DialogDescription>
            سيتم توليد أكواد عشوائية بطول 12 حرف (بدون أحرف ملتبسة مثل 0/O أو 1/I).
          </DialogDescription>
        </DialogHeader>
        {generated ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
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
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: حملة تسويقية ديسمبر"
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
