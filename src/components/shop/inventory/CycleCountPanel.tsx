'use client'

/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — لوحة «الجرد الدوري المجدول» في محطة الجرد.
 *
 * أداة أتمتة في يد صاحب المحل: «جرد الإكسسوارات كل سبت — أعمي». الجداول
 * بتتعرض هنا مع مفتاح تشغيل/إيقاف لكل واحدة، وإنشاء جدول جديد بأي تصنيف
 * أو الكتالوج كله + أعمي/تقليدي + يومي/أسبوعي/شهري بتوقيت المحل.
 *
 * المحرك نفسه في /api/inventory/cycle-count/run — أول تشغيل للتطبيق في
 * الموعد (الداشبورد أو المحطة) بيولّد ورقة الجرد تلقائياً + إشعار.
 */

import * as React from 'react'
import { CalendarClock, Loader2, Plus, RefreshCw, Trash2, EyeOff, ListChecks, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { frequencyLabel, scopeLabel } from '@/lib/cycle-count'
import type { Branch } from './types'

interface CycleSchedule {
  id: number
  branchId: number | null
  branchName: string | null
  category: string | null
  mode: string
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  enabled: boolean
  note: string | null
  lastRunAt: string | null
  pendingDraft: boolean
}

const WEEKDAYS = ['الأحد', 'الإتنين', 'التلاتة', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function CycleCountPanel({ branches, onChanged }: { branches: Branch[]; onChanged: () => void }) {
  const [schedules, setSchedules] = React.useState<CycleSchedule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [creating, setCreating] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [togglingId, setTogglingId] = React.useState<number | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  // حقول الجدول الجديد
  const [fBranch, setFBranch] = React.useState<string>('all')
  const [fCategory, setFCategory] = React.useState<string>('all')
  const [fMode, setFMode] = React.useState<'blind' | 'open'>('blind')
  const [fFrequency, setFFrequency] = React.useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [fDayOfWeek, setFDayOfWeek] = React.useState<string>('6')
  const [fDayOfMonth, setFDayOfMonth] = React.useState<string>('1')
  const [fNote, setFNote] = React.useState('')
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ schedules: CycleSchedule[] }>('/api/inventory/cycle-count')
      setSchedules(Array.isArray(r?.schedules) ? r.schedules : [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!creating) return
    api<{ id: number; name: string }[]>('/api/categories')
      .then((cats) => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => setCategories([]))
  }, [creating])

  const create = async () => {
    if (saving) return
    setSaving(true)
    try {
      await api('/api/inventory/cycle-count', {
        method: 'POST',
        body: {
          branchId: fBranch === 'all' ? null : parseInt(fBranch, 10),
          category: fCategory === 'all' ? null : fCategory,
          mode: fMode,
          frequency: fFrequency,
          dayOfWeek: fFrequency === 'weekly' ? parseInt(fDayOfWeek, 10) : null,
          dayOfMonth: fFrequency === 'monthly' ? parseInt(fDayOfMonth, 10) : null,
          note: fNote.trim() || null,
          enabled: true,
        },
      })
      toast.success('تم إنشاء الجدول — أول موعد هيتولّد منه جرد تلقائي')
      setCreating(false)
      setFNote('')
      void load()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (s: CycleSchedule) => {
    if (togglingId != null) return
    setTogglingId(s.id)
    try {
      await api(`/api/inventory/cycle-count/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } })
      toast.success(!s.enabled ? 'الجدول شغّال تاني' : 'الجدول ايقف — مش هيولّد جرد لحد ما تشغّله')
      void load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التغيير')
    } finally {
      setTogglingId(null)
    }
  }

  const remove = async (s: CycleSchedule) => {
    if (deletingId != null) return
    setDeletingId(s.id)
    try {
      await api(`/api/inventory/cycle-count/${s.id}`, { method: 'DELETE' })
      toast.success('الجدول اتمسح — الأوراق المتولّدة منه فضلت في الأرشيف')
      void load()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setDeletingId(null)
    }
  }

  const modeBadge = (m: string) =>
    m === 'blind' ? (
      <span className="flex items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-violet-700 dark:text-violet-300">
        <EyeOff className="size-3" /> أعمي
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
        <ListChecks className="size-3" /> تقليدي
      </span>
    )

  return (
    <section className="animate-in-up space-y-3 rounded-2xl border border-sky-500/20 bg-card p-4 shadow-sm sm:p-5" aria-label="الجرد الدوري المجدول">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
            <CalendarClock className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-base font-extrabold">الجرد الدوري المجدول</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              حدد جدول (مثال: الإكسسوارات كل سبت — أعمي) والنظام يولّد ورقة الجرد تلقائياً في موعدها — بتوقيت المحل.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} title="تحديث" className="text-muted-foreground">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
          <Button onClick={() => setCreating(true)} className="bg-sky-600 text-white hover:bg-sky-700">
            <Plus className="size-4" />
            جدول جديد
          </Button>
        </div>
      </div>

      {schedules.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
          مفيش جداول لسه — اعمل أول جدول دوري وهيتولّد لوحده في موعده
        </p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5',
                !s.enabled && 'opacity-60',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm">{scopeLabel(s.category)}</b>
                  {modeBadge(s.mode)}
                  {s.pendingDraft && (
                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                      فيه مسودة معلّقة
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {frequencyLabel(s)} · {s.branchName ?? 'كل الفروع'}
                  {s.lastRunAt ? ` · آخر توليد: ${new Date(s.lastRunAt).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ' · لسه ماتولّدش'}
                  {s.note ? ` · ${s.note}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={() => void toggle(s)}
                  disabled={togglingId === s.id}
                  aria-label={s.enabled ? 'إيقاف الجدول' : 'تشغيل الجدول'}
                />
                <Button
                  variant="ghost" size="icon"
                  onClick={() => void remove(s)}
                  disabled={deletingId === s.id}
                  title="حذف الجدول"
                  className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  {deletingId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ═════════ دايلوج إنشاء جدول ═════════ */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) setCreating(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>جدول جرد دوري جديد</DialogTitle>
            <DialogDescription>
              المدير بيحدد النطاق والإيقاع — والنظام يولّد الورقة تلقائياً في الموعد
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="text-xs font-bold">الفرع</span>
                <Select value={fBranch} onValueChange={setFBranch}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.isMain ? ' ★' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold">النطاق</span>
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكتالوج كله</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="text-xs font-bold">نوع الورقة</span>
                <Select value={fMode} onValueChange={(v) => setFMode(v as 'blind' | 'open')}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blind">جرد أعمي (موصى به)</SelectItem>
                    <SelectItem value="open">جرد تقليدي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold">الإيقاع</span>
                <Select value={fFrequency} onValueChange={(v) => setFFrequency(v as typeof fFrequency)}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">كل يوم</SelectItem>
                    <SelectItem value="weekly">كل أسبوع</SelectItem>
                    <SelectItem value="monthly">كل شهر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fFrequency === 'weekly' && (
              <div className="space-y-1">
                <span className="text-xs font-bold">يوم الأسبوع</span>
                <Select value={fDayOfWeek} onValueChange={setFDayOfWeek}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {fFrequency === 'monthly' && (
              <div className="space-y-1">
                <span className="text-xs font-bold">يوم الشهر (1..28)</span>
                <Input
                  type="number" min={1} max={28}
                  value={fDayOfMonth}
                  onChange={(e) => setFDayOfMonth(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
            <div className="space-y-1">
              <span className="text-xs font-bold">ملاحظة (اختياري)</span>
              <Input
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
                placeholder="مثال: جرد الإكسسوارات الأسبوعي"
                className="h-10"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>إلغاء</Button>
            <Button onClick={() => void create()} disabled={saving} className="bg-sky-600 text-white hover:bg-sky-700">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إنشاء الجدول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
