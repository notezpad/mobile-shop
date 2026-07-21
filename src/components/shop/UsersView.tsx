'use client'

import * as React from 'react'
import { FileText, Loader2, Pencil, Plus, ShieldCheck, User, UserCog } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { formatArabicDateTime } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { printListReportHtml, openPrintWindow } from '@/lib/print'
import { useShopStore } from '@/lib/store'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
  lastLoginAt?: string | null
  branchId?: number | null
  branch?: { name: string } | null
}

export function UsersView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<UserRow[]>('/api/users')
      setUsers(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const toggleActive = async (u: UserRow) => {
    try {
      await api(`/api/users/${u.id}`, {
        method: 'PUT',
        body: { active: !u.active },
      })
      toast.success(u.active ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  const exportPdf = () => {
    const admins = users.filter((u) => u.role === 'ADMIN').length
    const active = users.filter((u) => u.active).length

    const html = printListReportHtml(
      {
        title: 'المستخدمين',
        subtitle: 'إدارة حسابات المدراء والموظفين',
        columns: [
          { header: '#' },
          { header: 'الاسم', align: 'right' },
          { header: 'البريد الإلكتروني' },
          { header: 'الدور' },
          { header: 'الحالة' },
          { header: 'الفرع' },
          { header: 'تاريخ الإنشاء' },
          { header: 'آخر دخول' },
        ],
        rows: users.map((u, i) => [
          String(i + 1),
          u.name,
          u.email,
          u.role === 'ADMIN' ? 'المدير' : 'الموظف',
          u.active ? 'نشط' : 'موقوف',
          u.branch?.name ?? 'كل الفروع',
          formatArabicDateTime(u.createdAt),
          u.lastLoginAt ? formatArabicDateTime(u.lastLoginAt) : 'لم يسجل دخول بعد',
        ]),
        kpis: [
          { label: 'إجمالي المستخدمين', value: String(users.length) },
          { label: 'المدراء', value: String(admins) },
          { label: 'الحسابات النشطة', value: String(active), emphasize: true },
        ],
        emptyMessage: 'لا يوجد مستخدمين',
      },
      {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
        logo: shopBranding.logoPath || undefined,
      }
    )
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المستخدمين</h1>
          <p className="text-sm text-muted-foreground">
            إدارة حسابات المدراء والموظفين
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={loading}>
            <FileText className="size-4" />
            تصدير PDF
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            مستخدم جديد
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد الإلكتروني</TableHead>
                    <TableHead className="w-28 text-center">الدور</TableHead>
                    <TableHead className="w-24 text-center">الحالة</TableHead>
                    <TableHead className="w-28">الفرع</TableHead>
                    <TableHead className="w-36">تاريخ الإنشاء</TableHead>
                    <TableHead className="w-36">آخر دخول</TableHead>
                    <TableHead className="w-32 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا يوجد مستخدمون
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u, index) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {u.email}
                        </TableCell>
                        <TableCell className="text-center">
                          {u.role === 'ADMIN' ? (
                            <Badge className="bg-primary/10 text-primary">
                              <ShieldCheck className="ml-1 size-3" />
                              المدير
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <User className="ml-1 size-3" />
                              الموظف
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {u.active ? (
                            <Badge className="bg-success-subtle text-success">
                              نشط
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              معطّل
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {u.branch?.name ?? 'كل الفروع'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <DateTimeCell date={u.createdAt} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {u.lastLoginAt ? <DateTimeCell date={u.lastLoginAt} /> : 'لم يسجل دخول بعد'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => {
                                setEditing(u)
                                setDialogOpen(true)
                              }}
                              title="تعديل"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => toggleActive(u)}
                              title={u.active ? 'تعطيل' : 'تفعيل'}
                            >
                              {u.active ? 'تعطيل' : 'تفعيل'}
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

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={load}
      />
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: UserRow | null
  onSaved: () => void
}

function UserDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE')
  const [saving, setSaving] = React.useState(false)
  const [branchId, setBranchId] = React.useState<string>('')
  const [branches, setBranches] = React.useState<{ id: number; name: string }[]>([])

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setEmail(initial?.email ?? '')
      setPassword('')
      setRole((initial?.role as 'ADMIN' | 'EMPLOYEE') ?? 'EMPLOYEE')
      setBranchId(initial?.branchId != null ? String(initial.branchId) : '')
      fetch('/api/branches').then(r => r.ok ? r.json() : []).then(setBranches).catch(() => setBranches([]))
    }
  }, [open, initial])

  const submit = async () => {
    if (!name.trim()) {
      toast.error('الاسم مطلوب')
      return
    }
    if (!email.trim()) {
      toast.error('البريد الإلكتروني مطلوب')
      return
    }
    if (!initial && password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    setSaving(true)
    try {
      if (initial) {
        const body: any = {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          branchId: branchId ? parseInt(branchId, 10) : null,
        }
        if (password) body.password = password
        await api(`/api/users/${initial.id}`, { method: 'PUT', body })
        toast.success('تم تحديث المستخدم')
      } else {
        await api('/api/users', {
          method: 'POST',
          body: {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            role,
            branchId: branchId ? parseInt(branchId, 10) : null,
          },
        })
        toast.success('تمت إضافة المستخدم')
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
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="size-5 text-primary" />
            {initial ? 'تعديل مستخدم' : 'مستخدم جديد'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">
              البريد الإلكتروني <span className="text-destructive">*</span>
            </Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-pass">
              كلمة المرور{' '}
              {initial ? (
                <span className="text-muted-foreground text-xs">
                  (اتركها فارغة للإبقاء على الحالية)
                </span>
              ) : (
                <span className="text-destructive">*</span>
              )}
            </Label>
            <Input
              id="u-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              placeholder="******"
            />
          </div>
          <div className="space-y-1.5">
            <Label>الدور</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as 'ADMIN' | 'EMPLOYEE')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">المدير</SelectItem>
                <SelectItem value="EMPLOYEE">الموظف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label>الفرع {role === 'EMPLOYEE' && <span className="text-xs text-muted-foreground">(الموظف سيرى بيانات هذا الفرع فقط)</span>}</Label>
              <Select value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">كل الفروع (مدير)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
