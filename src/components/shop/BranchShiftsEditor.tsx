'use client'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — محرر ورديات الفرع (مشترك بين صفحة
 * الفروع والإعدادات): صفوف [الاسم | من | إلى]، والوردية اللي من ساعتها
 * لساعتها بتعدّي نص الليل (ليلي 10:00 م → 6:00 ص) مدعومة.
 *
 * الفرع اللي من غير ورديات = ميزة «إغلاق الوردية» متفعّلةش عنده خالص
 * (زرار نقطة البيع مش هيظهر لكاشيره).
 */

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { normalizeShifts, type BranchShift } from '@/lib/branch-shifts'

const timeInputCls =
  'h-10 w-full rounded-lg border bg-background px-2 text-center text-sm font-bold tabular-nums outline-none transition-shadow focus:border-lime-500 focus:ring-[3px] focus:ring-lime-400/30 [color-scheme:light] dark:[color-scheme:dark]'

export function BranchShiftsEditor({
  shifts,
  onChange,
  disabled,
}: {
  shifts: BranchShift[]
  onChange: (shifts: BranchShift[]) => void
  disabled?: boolean
}) {
  const rows = normalizeShifts(shifts)

  const update = (i: number, patch: Partial<BranchShift>) => {
    const next = rows.map((s, j) => (j === i ? { ...s, ...patch } : s))
    onChange(next)
  }

  const remove = (i: number) => {
    onChange(rows.filter((_, j) => j !== i))
  }

  const add = () => {
    const names = ['صباحي', 'مسائي', 'ليلي', 'وردية 4', 'وردية 5', 'وردية 6', 'وردية 7', 'وردية 8']
    const used = new Set(rows.map((s) => s.name))
    const name = names.find((n) => !used.has(n)) ?? `وردية ${rows.length + 1}`
    // أوقات افتراضية مختلفة لكل وردية (تتعرض 12 ساعة): صباحي 8ص–4م / مسائي 4م–12ص / ليلي 12ص–8ص
    const defaults: Record<string, [string, string]> = {
      'صباحي': ['08:00', '16:00'],
      'مسائي': ['16:00', '00:00'],
      'ليلي': ['00:00', '08:00'],
    }
    const [from, to] = defaults[name] ?? ['08:00', '16:00']
    onChange([...rows, { name, from, to }])
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed bg-card/60 px-3 py-3 text-center text-xs font-medium text-foreground/60">
          مفيش ورديات — الميزة متوقفة للفرع ده
        </p>
      )}
      {rows.map((s, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"
        >
          <Input
            value={s.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="اسم الوردية"
            maxLength={40}
            disabled={disabled}
            aria-label={`اسم الوردية ${i + 1}`}
            className="h-10 min-w-24 flex-1 text-sm font-bold"
          />
          <div className="flex items-center gap-1.5" dir="ltr">
            <input
              type="time"
              value={s.from}
              onChange={(e) => update(i, { from: e.target.value })}
              disabled={disabled}
              aria-label={`بداية الوردية ${i + 1}`}
              className={cn(timeInputCls, 'w-[7.5rem]')}
            />
            <span aria-hidden className="text-xs font-bold text-muted-foreground">
              →
            </span>
            <input
              type="time"
              value={s.to}
              onChange={(e) => update(i, { to: e.target.value })}
              disabled={disabled}
              aria-label={`نهاية الوردية ${i + 1}`}
              className={cn(timeInputCls, 'w-[7.5rem]')}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(i)}
            disabled={disabled}
            aria-label={`حذف الوردية ${s.name}`}
            className="shrink-0 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={disabled || rows.length >= 8}
          className="h-9"
        >
          <Plus className="size-4" />
          إضافة وردية
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          وردية تعدّي نص الليل؟ اكتب من 10:00 م لـ 6:00 ص
        </p>
      </div>
    </div>
  )
}
