'use client'

import * as React from 'react'
import {
  Store,
  Eye,
  Pencil,
  LogIn,
  Pause,
  Play,
  Trash2,
  Plus,
  Search,
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  Save,
  Copy,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatCurrency, formatShortDate, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useShopStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

interface TenantRow {
  id: string
  shopName: string
  phone: string | null
  address: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  status: string
  createdAt: string
  lastLoginAt: string | null
  usersCount: number
  planCode: string
  planName: string
  subscriptionEnd: string | null
}

interface Plan {
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
    suspended: { label: 'موقوف', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    expired: { label: 'منتهي', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' },
    cancelled: { label: 'ملغي', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30' },
    trial: { label: 'تجريبي', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30' },
  }
  const cfg = map[status] ?? { label: status, cls: '' }
  return (
    <Badge variant="outline" className={`text-[11px] ${cfg.cls}`}>
      {cfg.label}
    </Badge>
  )
}

export function AdminTenantsView() {
  const [rows, setRows] = React.useState<TenantRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [planFilter, setPlanFilter] = React.useState('all')
  const [plans, setPlans] = React.useState<Plan[]>([])

  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editRow, setEditRow] = React.useState<TenantRow | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const router = useRouter()
  const setUser = useShopStore((s) => s.setUser)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (planFilter && planFilter !== 'all') params.set('plan', planFilter)
      const data = await api<{ items: TenantRow[] }>(`/api/admin/tenants?${params.toString()}`)
      setRows(data.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المحلات')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, planFilter])

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await api<{ items: Plan[] }>('/api/admin/plans')
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

  const handleImpersonate = async (id: string) => {
    setBusyId(id)
    try {
      await api(`/api/admin/tenants/${id}/impersonate`, { method: 'POST' })
      toast.success('تم الدخول كمالك للمحل')
      // Refresh the page to load the shop UI for this tenant
      setUser(null)
      setTimeout(() => window.location.reload(), 200)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الدخول كمالك')
      setBusyId(null)
    }
  }

  const handleToggleStatus = async (row: TenantRow) => {
    setBusyId(row.id)
    try {
      const newStatus = row.status === 'suspended' ? 'active' : 'suspended'
      await api(`/api/admin/tenants/${row.id}`, {
        method: 'PUT',
        body: { status: newStatus },
      })
      toast.success(newStatus === 'active' ? 'تم تفعيل المحل' : 'تم إيقاف المحل')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setBusyId(deleteId)
    try {
      await api(`/api/admin/tenants/${deleteId}`, { method: 'DELETE' })
      toast.success('تم حذف (إلغاء) المحل')
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
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم، البريد، الهاتف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                  onKeyDown={(e) => e.key === 'Enter' && load()}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="suspended">موقوف</SelectItem>
                  <SelectItem value="expired">منتهي</SelectItem>
                  <SelectItem value="trial">تجريبي</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue placeholder="الباقة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الباقات</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              إضافة محل
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
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>اسم المحل</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead className="w-28">الباقة</TableHead>
                    <TableHead className="w-24 text-center">الحالة</TableHead>
                    <TableHead className="w-32">تاريخ التسجيل</TableHead>
                    <TableHead className="w-32">آخر دخول</TableHead>
                    <TableHead className="w-44 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        لا توجد محلات مطابقة
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{r.shopName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{r.ownerEmail ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{r.planName}</Badge>
                        </TableCell>
                        <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-xs">{formatShortDate(r.createdAt)}</TableCell>
                        <TableCell className="text-xs">{r.lastLoginAt ? formatShortDate(r.lastLoginAt) : '-'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title="عرض تفاصيل"
                              onClick={() => {
                                setDetailId(r.id)
                                setDetailOpen(true)
                              }}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title="تعديل"
                              onClick={() => {
                                setEditRow(r)
                                setEditOpen(true)
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-amber-600 hover:text-amber-700"
                              title="دخول كمالك"
                              disabled={busyId === r.id}
                              onClick={() => handleImpersonate(r.id)}
                            >
                              {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title={r.status === 'suspended' ? 'تفعيل' : 'إيقاف'}
                              disabled={busyId === r.id}
                              onClick={() => handleToggleStatus(r)}
                            >
                              {r.status === 'suspended' ? <Play className="size-4" /> : <Pause className="size-4" />}
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

      {/* Detail Dialog */}
      {detailOpen && detailId && (
        <TenantDetailDialog
          id={detailId}
          open={detailOpen}
          onOpenChange={(o) => {
            setDetailOpen(o)
            if (!o) setDetailId(null)
          }}
        />
      )}

      {/* Edit Dialog */}
      {editOpen && editRow && (
        <EditTenantDialog
          row={editRow}
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o)
            if (!o) setEditRow(null)
          }}
          onSaved={load}
        />
      )}

      {/* Add Dialog */}
      <AddTenantDialog
        plans={plans}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={load}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المحل</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء المحل وتعطيل جميع اشتراكاته. لن يتم حذف البيانات فعلياً.
              هذا الإجراء قابل للتراجع بتفعيل المحل يدوياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
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

/* ---------------- Detail Dialog ---------------- */

function TenantDetailDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [data, setData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [notes, setNotes] = React.useState('')
  const [savingNotes, setSavingNotes] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<any>(`/api/admin/tenants/${id}`)
      setData(d)
      setNotes(d.adminNotes ?? '')
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      await api(`/api/admin/tenants/${id}`, {
        method: 'PUT',
        body: { adminNotes: notes },
      })
      toast.success('تم حفظ الملاحظات')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل المحل</DialogTitle>
          <DialogDescription>معلومات شاملة عن المحل واشتراكاته</DialogDescription>
        </DialogHeader>
        {loading || !data ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow icon={Store} label="اسم المحل" value={data.shopName} />
              <InfoRow icon={Phone} label="الهاتف" value={data.phone ?? data.ownerPhone ?? '-'} dir="ltr" />
              <InfoRow icon={Mail} label="بريد المالك" value={data.ownerEmail ?? '-'} dir="ltr" />
              <InfoRow icon={MapPin} label="العنوان" value={data.address ?? '-'} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatBox label="المنتجات" value={String(data.stats.productsCount)} />
              <StatBox label="المبيعات" value={String(data.stats.salesCount)} />
              <StatBox label="المستخدمين" value={String(data.stats.usersCount)} />
              <StatBox label="رصيد الخزنة" value={formatCurrency(data.stats.cashBalance)} />
              <StatBox label="مبيعات 30 يوم" value={formatCurrency(data.stats.last30Sales)} />
              <StatBox label="أرباح 30 يوم" value={formatCurrency(data.stats.last30Profit)} />
            </div>

            {/* Subscription history */}
            <div>
              <p className="mb-2 text-sm font-semibold">سجل الاشتراكات</p>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">الباقة</TableHead>
                      <TableHead className="w-24">الفترة</TableHead>
                      <TableHead className="w-32">البداية</TableHead>
                      <TableHead className="w-32">النهاية</TableHead>
                      <TableHead className="w-28">المبلغ</TableHead>
                      <TableHead className="w-24">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.subscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                          لا توجد اشتراكات
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.subscriptions.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs">{s.plan.name}</TableCell>
                          <TableCell className="text-xs">{s.period}</TableCell>
                          <TableCell className="text-xs">{formatShortDate(s.startDate)}</TableCell>
                          <TableCell className="text-xs">{formatShortDate(s.endDate)}</TableCell>
                          <TableCell className="text-xs">{formatCurrency(s.amountPaid)}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Users */}
            <div>
              <p className="mb-2 text-sm font-semibold">المستخدمين ({data.users.length})</p>
              <div className="max-h-32 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>البريد</TableHead>
                      <TableHead className="w-28">الدور</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.users.map((u: any) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-xs">{u.name}</TableCell>
                        <TableCell className="text-xs" dir="ltr">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {u.role === 'ADMIN' ? 'مدير' : u.role === 'SUPER_ADMIN' ? 'أدمن أعلى' : 'موظف'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Admin notes */}
            <div>
              <Label className="mb-1.5 block">ملاحظات إدارية</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات داخلية للأدمن..."
                rows={3}
              />
              <Button
                size="sm"
                className="mt-2 gap-1.5"
                disabled={savingNotes}
                onClick={saveNotes}
              >
                {savingNotes ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                حفظ الملاحظات
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  dir,
}: {
  icon: any
  label: string
  value: string
  dir?: 'ltr' | 'rtl'
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium" dir={dir}>{value}</p>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

/* ---------------- Edit Dialog ---------------- */

function EditTenantDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: TenantRow
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [shopName, setShopName] = React.useState(row.shopName)
  const [phone, setPhone] = React.useState(row.ownerPhone ?? row.phone ?? '')
  const [address, setAddress] = React.useState(row.address ?? '')
  const [status, setStatus] = React.useState(row.status)
  const [ownerEmail, setOwnerEmail] = React.useState(row.ownerEmail ?? '')
  const [adminNotes, setAdminNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setShopName(row.shopName)
    setPhone(row.ownerPhone ?? row.phone ?? '')
    setAddress(row.address ?? '')
    setStatus(row.status)
    setOwnerEmail(row.ownerEmail ?? '')
  }, [row])

  // Load existing notes
  React.useEffect(() => {
    if (open) {
      api<any>(`/api/admin/tenants/${row.id}`)
        .then((d) => setAdminNotes(d.adminNotes ?? ''))
        .catch(() => {})
    }
  }, [open, row.id])

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/admin/tenants/${row.id}`, {
        method: 'PUT',
        body: {
          shopName,
          phone,
          address,
          status,
          ownerEmail,
          ownerPhone: phone,
          adminNotes,
        },
      })
      toast.success('تم تحديث بيانات المحل')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل بيانات المحل</DialogTitle>
          <DialogDescription>{row.shopName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>اسم المحل</Label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>بريد المالك</Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>العنوان</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="expired">منتهي</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات إدارية</Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="ملاحظات داخلية..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Add Dialog ---------------- */

function AddTenantDialog({
  plans,
  open,
  onOpenChange,
  onSaved,
}: {
  plans: Plan[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [shopName, setShopName] = React.useState('')
  const [ownerEmail, setOwnerEmail] = React.useState('')
  const [ownerPhone, setOwnerPhone] = React.useState('')
  const [planId, setPlanId] = React.useState<string>('')
  const [period, setPeriod] = React.useState<'monthly' | 'yearly' | 'trial'>('monthly')
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState<{ email: string; password: string } | null>(null)

  React.useEffect(() => {
    if (open) {
      setShopName('')
      setOwnerEmail('')
      setOwnerPhone('')
      setPlanId(plans.find((p) => p.code === 'pro')?.id?.toString() ?? '')
      setPeriod('monthly')
      setResult(null)
    }
  }, [open, plans])

  const save = async () => {
    if (!shopName || !ownerEmail || !planId) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة')
      return
    }
    setSaving(true)
    try {
      const data = await api<{ user: { email: string; password: string } }>(
        '/api/admin/tenants',
        {
          method: 'POST',
          body: {
            shopName,
            ownerEmail,
            ownerPhone,
            planId: Number(planId),
            period,
          },
        }
      )
      setResult(data.user)
      toast.success('تم إنشاء المحل بنجاح')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  const copyCreds = () => {
    if (!result) return
    const text = `البريد: ${result.email}\nكلمة المرور: ${result.password}`
    navigator.clipboard.writeText(text)
    toast.success('تم نسخ البيانات')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة محل جديد</DialogTitle>
          <DialogDescription>
            سيتم إنشاء المحل + حساب مدير + اشتراك مبدئي. ستظهر كلمة المرور مرة واحدة.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                ✅ تم إنشاء المحل بنجاح
              </p>
              <div className="space-y-1 text-sm">
                <p>البريد: <span dir="ltr" className="font-mono">{result.email}</span></p>
                <p>كلمة المرور: <span dir="ltr" className="font-mono font-bold">{result.password}</span></p>
              </div>
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={copyCreds}>
                <Copy className="size-3.5" />
                نسخ البيانات
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>تم</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>اسم المحل *</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>بريد المالك *</Label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الهاتف</Label>
                  <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} dir="ltr" />
                </div>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="size-4 animate-spin" />}
                <Plus className="size-4" />
                إنشاء
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
