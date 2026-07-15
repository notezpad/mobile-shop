'use client'

import * as React from 'react'
import { Building2, Plus, Pencil, Trash2, Loader2, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

interface Branch {
  id: number
  name: string
  address: string | null
  phone: string | null
  active: boolean
  isMain: boolean
  createdAt: string
}

interface BranchReport {
  branchId: number
  name: string
  isMain: boolean
  salesCount: number
  totalSales: number
  totalProfit: number
  productCount: number
}

export function BranchesView() {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [reports, setReports] = React.useState<BranchReport[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Branch | null>(null)
  const [form, setForm] = React.useState({ name: '', address: '', phone: '', active: true })
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, rs] = await Promise.all([
        api<Branch[]>('/api/branches'),
        api<BranchReport[]>('/api/reports/branches'),
      ])
      setBranches(bs); setReports(rs)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الفروع')
    } finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load() }, [load])

  const openNew = () => { setEditing(null); setForm({ name: '', address: '', phone: '', active: true }); setOpen(true) }
  const openEdit = (b: Branch) => { setEditing(b); setForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '', active: b.active }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('اسم الفرع مطلوب'); return }
    setSaving(true)
    try {
      if (editing) {
        await api(`/api/branches/${editing.id}`, { method: 'PATCH', body: form })
        toast.success('تم تحديث الفرع')
      } else {
        await api('/api/branches', { method: 'POST', body: form })
        toast.success('تم إنشاء الفرع')
      }
      setOpen(false); load()
    } catch (e: any) { toast.error(e?.message || 'فشل الحفظ') }
    finally { setSaving(false) }
  }

  const remove = async (b: Branch) => {
    if (!confirm(`حذف الفرع "${b.name}"؟ (سيتم فك ارتباط منتجاته وموظفيه)`)) return
    try {
      await api(`/api/branches/${b.id}`, { method: 'DELETE' })
      toast.success('تم الحذف'); load()
    } catch (e: any) { toast.error(e?.message || 'فشل الحذف') }
  }

  const reportMap = new Map(reports.map(r => [r.branchId, r]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">إدارة الفروع</h2>
          <p className="text-sm text-muted-foreground">أنشئ فروعك وشاهد أداء كل فرع على حدة.</p>
        </div>
        <Button onClick={openNew}><Plus className="size-4 ml-1" /> فرع جديد</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {loading ? Array.from({length:3}).map((_,i)=>(<Skeleton key={i} className="h-32"/>)) :
          branches.map(b => {
            const r = reportMap.get(b.id)
            return (
              <Card key={b.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-primary"/>
                    <span>{b.name}</span>
                    {b.isMain && <Badge variant="outline" className="text-[10px]"><Star className="size-3 ml-0.5"/>رئيسي</Badge>}
                    {!b.active && <Badge variant="destructive" className="text-[10px]">موقوف</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="text-muted-foreground">{b.address || '—'}</p>
                  <p className="text-muted-foreground">{b.phone || '—'}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-muted p-1.5">
                      <div className="text-[10px] text-muted-foreground">مبيعات</div>
                      <div className="text-xs font-bold">{formatCurrency(r?.totalSales ?? 0)}</div>
                    </div>
                    <div className="rounded bg-muted p-1.5">
                      <div className="text-[10px] text-muted-foreground">أرباح</div>
                      <div className="text-xs font-bold text-emerald-600">{formatCurrency(r?.totalProfit ?? 0)}</div>
                    </div>
                    <div className="rounded bg-muted p-1.5">
                      <div className="text-[10px] text-muted-foreground">منتجات</div>
                      <div className="text-xs font-bold">{r?.productCount ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(b)}><Pencil className="size-3 ml-1"/>تعديل</Button>
                    <Button variant="outline" size="sm" onClick={() => remove(b)}><Trash2 className="size-3"/></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        }
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">تقرير أداء الفروع</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفرع</TableHead>
                <TableHead>عدد الفواتير</TableHead>
                <TableHead>إجمالي المبيعات</TableHead>
                <TableHead>الأرباح</TableHead>
                <TableHead>عدد المنتجات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا يوجد فروع بعد</TableCell></TableRow>
              )}
              {reports.map(r => (
                <TableRow key={r.branchId}>
                  <TableCell className="font-medium">{r.name}{r.isMain && <Badge variant="outline" className="mr-2 text-[10px]">رئيسي</Badge>}</TableCell>
                  <TableCell>{r.salesCount}</TableCell>
                  <TableCell>{formatCurrency(r.totalSales)}</TableCell>
                  <TableCell className="text-emerald-600">{formatCurrency(r.totalProfit)}</TableCell>
                  <TableCell>{r.productCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل فرع' : 'فرع جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="فرع وسط البلد"/>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))}/>
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}/>
            </div>
            <div className="flex items-center justify-between">
              <Label>مُفعّل</Label>
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({...f, active: v}))}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="size-4 ml-1 animate-spin"/>}حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
