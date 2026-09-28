'use client'

import * as React from 'react'
import {
  Search,
  ClipboardList,
  Calendar,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { formatDate, formatCurrency, formatSignedNumber } from '@/lib/format'
import { DateTimeCell } from '../DateTimeCell'
import type { Branch, Movement } from '../InventoryView'

interface Props {
  movements: Movement[]
  branches: Branch[]
  isEmployee: boolean
  userBranchId: number | null
  onChanged: () => void
}

const TYPE_LABELS: Record<string, string> = {
  in: 'وارد',
  out: 'صادر',
  adjust: 'تعديل يدوي',
  sale: 'بيع',
  return: 'مرتجع',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  stocktake: 'تسوية جرد',
}

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  in: 'default',
  out: 'destructive',
  adjust: 'secondary',
  sale: 'outline',
  return: 'secondary',
  transfer_in: 'default',
  transfer_out: 'destructive',
  stocktake: 'secondary',
}

export function MovementsTab({ movements, branches, isEmployee, userBranchId, onChanged: _onChanged }: Props) {
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  // Reload movements when filters change
  const [liveMovements, setLiveMovements] = React.useState<Movement[]>(movements)
  React.useEffect(() => { setLiveMovements(movements) }, [movements])

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (branchFilter !== 'all') params.set('branchId', branchFilter)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (search.trim()) params.set('q', search.trim())
    const url = `/api/inventory/movements${params.toString() ? '?' + params.toString() : ''}`
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (alive) setLiveMovements(data as Movement[])
      } catch {}
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [branchFilter, typeFilter, from, to, search])

  const filtered = React.useMemo(() => {
    return liveMovements
  }, [liveMovements])

  // Summary by direction
  const summary = React.useMemo(() => {
    let inTotal = 0, outTotal = 0
    for (const m of filtered) {
      if (m.quantity > 0) inTotal += m.quantity
      else outTotal += Math.abs(m.quantity)
    }
    return { inTotal, outTotal }
  }, [filtered])

  const clearFilters = () => {
    setSearch(''); setBranchFilter('all'); setTypeFilter('all'); setFrom(''); setTo('')
  }
  const hasFilters = search || branchFilter !== 'all' || typeFilter !== 'all' || from || to

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label className="mb-1.5 flex items-center gap-1 text-xs">
                <Search className="size-3" />
                بحث (اسم / باركود / ملاحظة)
              </Label>
              <Input
                placeholder="ابحث في الحركات..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {!isEmployee && (
              <div className="w-full sm:w-48">
                <Label className="mb-1.5 block text-xs">الفرع</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    <SelectItem value="none">بدون فرع</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-full sm:w-44">
              <Label className="mb-1.5 block text-xs">النوع</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1.5 flex items-center gap-1 text-xs">
                <Calendar className="size-3" />
                من تاريخ
              </Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1 text-xs">
                <Calendar className="size-3" />
                إلى تاريخ
              </Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="ml-1 size-3" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-success-subtle text-success-subtle-foreground">
              <ArrowDownToLine className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">إجمالي الوارد</div>
              <div className="text-base font-bold text-success-subtle-foreground">+{summary.inTotal}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive-subtle text-destructive-subtle-foreground">
              <ArrowUpFromLine className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">إجمالي الصادر</div>
              <div className="text-base font-bold text-destructive-subtle-foreground">-{summary.outTotal}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">عدد الحركات</div>
              <div className="text-base font-bold">{filtered.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-base">سجل الحركات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden max-h-[60vh] overflow-auto lg:block">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur">
                <TableRow>
                  <TableHead className="w-40">التاريخ</TableHead>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="w-32">الفرع</TableHead>
                  <TableHead className="w-32">النوع</TableHead>
                  <TableHead className="w-24 text-center">الكمية</TableHead>
                  <TableHead className="w-28">بواسطة</TableHead>
                  <TableHead className="w-48">الملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <RefreshCw className="mx-auto mb-2 size-8 opacity-40" />
                      لا توجد حركات مطابقة
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <DateTimeCell date={m.createdAt} />
                      </TableCell>
                      <TableCell className="font-medium">{m.product?.name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.branch?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANTS[m.type] ?? 'outline'}>
                          {TYPE_LABELS[m.type] ?? m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${m.quantity < 0 ? 'text-destructive-subtle-foreground' : 'text-success-subtle-foreground'}`}>
                          {formatSignedNumber(m.quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.userName ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {m.note || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
          */}
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {filtered.length === 0 ? (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                لا توجد حركات
              </p>
            ) : (
              filtered.map((m, index) => {
                // الإشارة من الكمية المخزّنة نفسها (سالبة للصادر) — زي الجدول والإجماليات
                const incoming = m.quantity >= 0
                return (
                  <div key={m.id} className="rounded-lg border bg-card p-3 hover:bg-muted/30 dark:hover:bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{index + 1}
                          </span>
                          <Badge variant={incoming ? 'secondary' : 'destructive'} className="text-[10px]">
                            {TYPE_LABELS[m.type] ?? m.type}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate font-medium leading-tight">
                          {m.product?.name ?? '—'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          <DateTimeCell date={m.createdAt} />
                          {m.branch && <> • {m.branch.name}</>}
                        </p>
                      </div>
                      <p className={
                        incoming
                          ? 'shrink-0 text-base font-bold tabular-nums text-success'
                          : 'shrink-0 text-base font-bold tabular-nums text-destructive'
                      }>
                        {formatSignedNumber(m.quantity)}
                      </p>
                    </div>

                    {m.note && (
                      <p className="mt-2 text-xs text-muted-foreground">{m.note}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      بواسطة: {m.userName ?? '—'}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
