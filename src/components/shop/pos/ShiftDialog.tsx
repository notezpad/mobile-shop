'use client'

import * as React from 'react'
import { ChevronDown, Loader2, Lock, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PAY_METHOD_LABELS, shiftDifference, type PayMethod, type ShiftSummary } from '@/lib/pos/pricing'
import { DraftNumberInput } from './DraftNumberInput'
import type { ShiftRow, useShift } from './hooks/useShift'

type ShiftApi = ReturnType<typeof useShift>

const time = (iso: string) => new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
const dateTime = (iso: string) => new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const labelOf = (m: string) => PAY_METHOD_LABELS[m as PayMethod] ?? m

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn('tabular-nums', strong && 'text-base font-bold', tone === 'bad' && 'text-destructive', tone === 'good' && 'text-success-subtle-foreground')}>{v}</span>
    </div>
  )
}

function Report({ shift, summary }: { shift: ShiftRow; summary: ShiftSummary }) {
  const diff = shift.difference ?? null
  return (
    <div className="divide-y rounded-xl border px-3">
      <Row k="رصيد الافتتاح" v={formatCurrency(summary.openingCash)} />
      <Row k={`مبيعات (${summary.salesCount} فاتورة)`} v={formatCurrency(summary.salesCollected)} />
      <Row k="حركة الكاش في الدرج" v={formatCurrency(summary.cashMovement)} />
      <Row k="المتوقع في الدرج" v={formatCurrency(summary.expectedCash)} strong />
      {Object.entries(summary.otherMethods).map(([m, a]) => <Row key={m} k={`${labelOf(m)} (خارج الدرج)`} v={formatCurrency(a)} />)}
      {shift.countedCash != null && <Row k="المعدود فعلياً" v={formatCurrency(shift.countedCash)} />}
      {diff != null && (
        <Row k={diff < 0 ? 'عجز' : diff > 0 ? 'زيادة' : 'الفرق'} v={diff === 0 ? 'مضبوط ✓' : formatCurrency(Math.abs(diff))} strong tone={diff < 0 ? 'bad' : diff > 0 ? 'good' : undefined} />
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  shiftApi: ShiftApi
  canSeeHistory: boolean
}

/** Open the till with the starting cash; close it by counting. The server computes what SHOULD be in the drawer. */
export function ShiftDialog({ open, onOpenChange, shiftApi, canSeeHistory }: Props) {
  const { shift, summary, open: openShift, close, refresh } = shiftApi
  const [opening, setOpening] = React.useState(0)
  const [counted, setCounted] = React.useState(0)
  const [touched, setTouched] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [closedReport, setClosedReport] = React.useState<{ shift: ShiftRow; summary: ShiftSummary } | null>(null)
  const [history, setHistory] = React.useState<ShiftRow[] | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false

  React.useEffect(() => {
    if (!open) return
    setClosedReport(null)
    setTouched(false)
    setCounted(0)
    setNote('')
    setOpening(0)
    setShowHistory(false)
    setHistory(null)
    void refresh() // live numbers each time it opens
  }, [open, refresh])

  const loadHistory = async () => {
    setShowHistory((v) => !v)
    if (history) return
    try {
      const r = await api<{ data: ShiftRow[] }>('/api/pos/shift?history=1')
      setHistory(r.data)
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر تحميل السجل')
    }
  }

  const doOpen = async () => {
    setSaving(true)
    try {
      await openShift(opening)
      toast.success('اتفتحت الوردية')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر فتح الوردية')
    } finally {
      setSaving(false)
    }
  }

  const doClose = async () => {
    setSaving(true)
    try {
      const r = await close(counted, note.trim())
      setClosedReport(r)
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر قفل الوردية')
    } finally {
      setSaving(false)
    }
  }

  const expected = summary?.expectedCash ?? shift?.openingCash ?? 0
  const diff = touched ? shiftDifference(counted, expected) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shift && !closedReport ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            {closedReport ? 'تقرير الوردية' : shift ? 'قفل الوردية' : 'فتح وردية'}
          </DialogTitle>
          <DialogDescription>
            {closedReport ? 'الوردية اتقفلت.' : shift ? `مفتوحة من ${time(shift.openedAt)}${shift.local ? ' (لسه مش متزامنة)' : ''}` : 'اكتب المبلغ اللي في الدرج دلوقتي.'}
          </DialogDescription>
        </DialogHeader>

        {closedReport ? (
          <>
            <Report shift={closedReport.shift} summary={closedReport.summary} />
            <Button type="button" onClick={() => onOpenChange(false)}>تمام</Button>
          </>
        ) : !shift ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>رصيد الافتتاح (كاش في الدرج)</Label>
              <DraftNumberInput allowDecimal value={opening} onCommit={setOpening} className="h-12 text-center text-xl font-bold tabular-nums" aria-label="رصيد الافتتاح" />
            </div>
            <Button type="button" className="w-full" size="lg" disabled={saving} onClick={() => void doOpen()}>
              {saving && <Loader2 className="size-4 animate-spin" />} فتح الوردية
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {summary ? <Report shift={shift} summary={summary} /> : <p className="text-sm text-muted-foreground">لا توجد أرقام مباشرة (غير متصل).</p>}
            <div className="space-y-1.5">
              <Label>المبلغ المعدود فعلياً في الدرج</Label>
              <DraftNumberInput
                allowDecimal
                value={counted}
                onCommit={(n) => { setCounted(n); setTouched(true) }}
                className="h-12 text-center text-xl font-bold tabular-nums"
                aria-label="المبلغ المعدود"
              />
              {diff != null && (
                <p className={cn('text-sm font-medium', diff < 0 ? 'text-destructive' : diff > 0 ? 'text-success-subtle-foreground' : 'text-muted-foreground')}>
                  {diff === 0 ? 'مضبوط ✓' : diff < 0 ? `عجز ${formatCurrency(Math.abs(diff))}` : `زيادة ${formatCurrency(diff)}`}
                </p>
              )}
            </div>
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري) — مثلاً سبب الفرق" aria-label="ملاحظة" />
            {!online && <p className="text-xs text-destructive">قفل الوردية محتاج اتصال بالإنترنت.</p>}
            <Button type="button" className="w-full" size="lg" disabled={saving || !touched || !online} onClick={() => void doClose()}>
              {saving && <Loader2 className="size-4 animate-spin" />} قفل الوردية
            </Button>
          </div>
        )}

        {canSeeHistory && !closedReport && (
          <div className="border-t pt-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" onClick={() => void loadHistory()}>
              آخر الورديات <ChevronDown className={cn('size-4 transition-transform', showHistory && 'rotate-180')} />
            </Button>
            {showHistory && (
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs">
                {!history ? <li className="py-2 text-center text-muted-foreground">…</li> : history.length === 0 ? <li className="py-2 text-center text-muted-foreground">مفيش ورديات لسه</li> : history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <span className="min-w-0 truncate">{h.userName ?? '—'} · {dateTime(h.openedAt)}</span>
                    {h.closedAt ? (
                      <span className={cn('shrink-0 tabular-nums font-semibold', (h.difference ?? 0) < 0 ? 'text-destructive' : (h.difference ?? 0) > 0 ? 'text-success-subtle-foreground' : '')}>
                        {(h.difference ?? 0) === 0 ? 'مضبوط' : `${(h.difference ?? 0) > 0 ? '+' : '−'}${formatCurrency(Math.abs(h.difference ?? 0))}`}
                      </span>
                    ) : <span className="shrink-0 text-warning-subtle-foreground">مفتوحة</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
