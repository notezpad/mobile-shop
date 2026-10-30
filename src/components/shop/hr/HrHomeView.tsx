'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, MonitorSmartphone, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmptyState, ListSkeleton, PageHead, PageShell, Pill, Stat, dayLabel, hrGet, money, monthLabel } from './hr-ui'

interface Summary {
  today: string; month: string; employeesCount: number; present: number
  late: { id: number; name: string; lateMinutes: number }[]
  absent: { id: number; name: string }[]
  leave: { id: number; name: string }[]
  onOff: number; notRecorded: number
  advances: { count: number; remaining: number }
  payroll: { runId: number | null; status: 'draft' | 'paid' | null; estimated: number; laborCost: number; isEstimate: boolean }
  salesThisMonth: number; laborPct: number | null
  alerts: { kind: 'attendance' | 'advance'; id: number; name: string; text: string }[]
}

export function HrHomeView() {
  const [s, setS] = React.useState<Summary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try { setS(await hrGet<Summary>('/api/hr/summary')) }
    catch (e: any) { toast.error(e?.message || 'فشل تحميل الملخص') }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  return (
    <PageShell>
      <PageHead title="الموارد البشرية" subtitle={s ? dayLabel(s.today) : undefined} />
      {loading || !s ? (
        <ListSkeleton />
      ) : s.employeesCount === 0 ? (
        <EmptyState
          title="ابدأ بإضافة موظفيك"
          hint="اسم وراتب ويوم إجازة لكل موظف — وبعدها تسجّل الحضور وتحسب الرواتب بضغطة."
          action={<Button asChild><Link href="/hr/employees">ضيف أول موظف</Link></Button>}
        />
      ) : (
        <div className="space-y-5">
          {/* النهارده */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold">النهارده</h2>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link></Button>
                <Button asChild size="sm"><Link href="/hr/attendance">سجّل الحضور</Link></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="حاضر" value={s.present} tone="emerald" />
              <Stat label="متأخر" value={s.late.length} tone="amber" />
              <Stat label="غائب" value={s.absent.length} tone="rose" />
              <Stat label="لسه ماتسجّلش" value={s.notRecorded} tone="slate" hint={s.onOff > 0 ? `${s.onOff} في إجازتهم الأسبوعية` : undefined} />
            </div>
            {(s.late.length > 0 || s.absent.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {s.late.map((e) => <Pill key={`l${e.id}`} tone="amber">{e.name} — متأخر {e.lateMinutes} د</Pill>)}
                {s.absent.map((e) => <Pill key={`a${e.id}`} tone="rose">{e.name} — غائب</Pill>)}
              </div>
            )}
          </section>

          {/* تنبيهات */}
          {s.alerts.length > 0 && (
            <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-400">
                <AlertTriangle className="size-4" />يستاهل انتباهك
              </div>
              <ul className="space-y-1 text-sm">
                {s.alerts.map((a) => (
                  <li key={`${a.kind}${a.id}`}><b>{a.name}</b> — {a.text}</li>
                ))}
              </ul>
            </section>
          )}

          {/* الفلوس */}
          <section>
            <h2 className="mb-2 text-base font-extrabold">فلوس الشهر — {monthLabel(s.month)}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={s.payroll.isEstimate ? 'تكلفة العمالة (تقديرية)' : 'تكلفة العمالة'} value={money(s.payroll.laborCost)} tone="violet" />
              <Stat
                label="من كل 100 جنيه بيع"
                value={s.laborPct === null ? '—' : `${s.laborPct} جنيه`}
                tone="sky"
                hint={s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `مبيعات الشهر ${money(s.salesThisMonth)}`}
              />
              <Stat label="سلف على الموظفين" value={money(s.advances.remaining)} tone="amber" hint={`${s.advances.count} سلفة جارية`} />
              <div className="flex flex-col justify-between rounded-2xl border bg-card p-4">
                <div className="text-xs font-bold text-muted-foreground">رواتب الشهر</div>
                <div className="my-2 text-lg font-extrabold">
                  {s.payroll.status === 'paid' ? 'اتصرفت ✅' : s.payroll.status === 'draft' ? 'مسودة جاهزة' : 'لسه ماتجهزتش'}
                </div>
                <Button asChild size="sm" variant={s.payroll.status === 'paid' ? 'outline' : 'default'} className="gap-1.5">
                  <Link href="/hr/payroll"><Wallet className="size-4" />{s.payroll.status === 'paid' ? 'عرض' : 'جهّز / اعتمد'}</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  )
}
