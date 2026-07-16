'use client'

import * as React from 'react'
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'

interface Order {
  id: number
  customerName: string
  phone: string | null
  device: string
  issue: string
  cost: number
  status: string
  receivedAt: string
  deliveredAt: string | null
}

const STATUSES = ['مستلم', 'قيد العمل', 'مكتمل', 'مُسلَّم'] as const
type Status = (typeof STATUSES)[number]

function statusVariant(s: string): string {
  switch (s) {
    case 'مستلم':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'قيد العمل':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'مكتمل':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'مُسلَّم':
      return 'bg-primary/15 text-primary border-primary/20'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function MaintenanceView() {
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Order | null>(null)
  const [busy, setBusy] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<Order[]>('/api/maintenance')
      setOrders(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل أOrders الصيانة')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const cycleStatus = async (o: Order) => {
    const idx = STATUSES.indexOf(o.status as Status)
    const next = STATUSES[(idx + 1) % STATUSES.length]
    setBusy(o.id)
    try {
      await api(`/api/maintenance/${o.id}`, {
        method: 'PUT',
        body: { status: next },
      })
      toast.success(`تم تغيير الحالة إلى: ${next}`)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التغيير')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('حذف أمر الصيانة؟')) return
    try {
      await api(`/api/maintenance/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">الصيانة</h1>
          <p className="text-sm text-muted-foreground">
            أوامر استلام الأجهاز وإصلاحها
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          أوردر صيانة جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead className="w-36">الهاتف</TableHead>
                    <TableHead>الجهاز</TableHead>
                    <TableHead className="w-28 text-center">الحالة</TableHead>
                    <TableHead className="w-28 text-center">التكلفة</TableHead>
                    <TableHead className="w-36">تاريخ الاستلام</TableHead>
                    <TableHead className="w-32 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد أوامر صيانة
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o, index) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-center font-mono text-xs">{index + 1}</TableCell>
                        <TableCell className="font-medium">{o.customerName}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {o.phone ?? '—'}
                        </TableCell>
                        <TableCell>{o.device}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={statusVariant(o.status)}
                          >
                            {o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatCurrency(o.cost)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(o.receivedAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => {
                                setEditing(o)
                                setDialogOpen(true)
                              }}
                              title="تعديل"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => cycleStatus(o)}
                              disabled={busy === o.id}
                              title="تغيير الحالة"
                            >
                              {busy === o.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <RefreshCw className="size-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => remove(o.id)}
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

      <OrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => load()}
      />
    </div>
  )
}

interface OrderDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Order | null
  onSaved: () => void
}

function OrderDialog({ open, onOpenChange, initial, onSaved }: OrderDialogProps) {
  const [customerName, setCustomerName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [device, setDevice] = React.useState('')
  const [issue, setIssue] = React.useState('')
  const [cost, setCost] = React.useState('0')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setCustomerName(initial?.customerName ?? '')
      setPhone(initial?.phone ?? '')
      setDevice(initial?.device ?? '')
      setIssue(initial?.issue ?? '')
      setCost(initial ? String(initial.cost) : '0')
    }
  }, [open, initial])

  const submit = async () => {
    if (!customerName.trim()) {
      toast.error('اسم العميل مطلوب')
      return
    }
    if (!device.trim()) {
      toast.error('الجهاز مطلوب')
      return
    }
    setSaving(true)
    try {
      const payload = {
        customerName: customerName.trim(),
        phone: phone.trim() || null,
        device: device.trim(),
        issue: issue.trim(),
        cost: parseFloat(cost) || 0,
      }
      if (initial) {
        await api(`/api/maintenance/${initial.id}`, {
          method: 'PUT',
          body: payload,
        })
        toast.success('تم تحديث أمر الصيانة')
      } else {
        await api('/api/maintenance', { method: 'POST', body: payload })
        toast.success('تمت إضافة أمر الصيانة')
      }
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {initial ? 'تعديل أمر صيانة' : 'أمر صيانة جديد'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="o-customer">
              اسم العميل <span className="text-destructive">*</span>
            </Label>
            <Input
              id="o-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-phone">التليفون</Label>
            <Input
              id="o-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-device">
              الجهاز <span className="text-destructive">*</span>
            </Label>
            <Input
              id="o-device"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="مثال: أيفون 13"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-issue">العطل / الملاحظات</Label>
            <Textarea
              id="o-issue"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-cost">التكلفة المتوقعة</Label>
            <Input
              id="o-cost"
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
