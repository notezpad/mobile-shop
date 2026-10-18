'use client'

/**
 * 🔎 2026-10-18 — فحص سلامة المخزون (للمدير).
 * بيعرض: منتجات كميتها الإجمالية لا تساوي مجموع مقاساتها، أوامر شراء اتسجلت على منتج له
 * مقاسات من غير تحديد المقاس، أرصدة سالبة، وعدد حركات الموظفين اللي محتاجة مراجعة.
 * المزامنة بتظبط كمية المنتج = مجموع مقاساته (وتتسجل حركة).
 */

import * as React from 'react'
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Report {
  drift: { productId: number; name: string; productQty: number; variantsSum: number }[]
  purchases: { orderNo: string; productId: number; name: string; quantity: number; returnedQty: number; createdAt: string }[]
  negative: { kind: string; productId: number; name: string; quantity: number }[]
  reviewCount: number
  ok: boolean
}

export function IntegrityPanel({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [report, setReport] = React.useState<Report | null>(null)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const run = React.useCallback(async () => {
    setLoading(true)
    try {
      setReport(await api<Report>('/api/inventory/integrity'))
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر فحص المخزون')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) void run()
  }, [open, run])

  const resync = async (productId: number) => {
    setBusyId(productId)
    try {
      await api('/api/inventory/integrity', { method: 'POST', body: { action: 'resync', productId } })
      toast.success('تمت المزامنة')
      await run()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشلت المزامنة')
    } finally {
      setBusyId(null)
    }
  }

  const problems = report ? report.drift.length + report.purchases.length + report.negative.length : 0

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <ShieldCheck className="size-4" aria-hidden />
        فحص سلامة المخزون
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              {report && !report.ok ? <ShieldAlert className="size-5 text-amber-600" /> : <ShieldCheck className="size-5 text-emerald-600" />}
              فحص سلامة المخزون
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5 px-5 py-4">
            {loading && !report ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> بيفحص...</p>
            ) : report ? (
              <>
                {problems === 0 && (
                  <p className="rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    ✅ مفيش مشاكل — كميات المنتجات مطابقة لمقاساتها ومفيش أرصدة سالبة.
                  </p>
                )}

                {report.drift.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-sm font-extrabold">كمية المنتج لا تساوي مجموع مقاساته ({report.drift.length})</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      المجموع الحقيقي هو مجموع المقاسات. لو الفرق سببه أمر شراء اتسجل من غير مقاس (تحت)، وزّع الكمية على المقاسات الأول من «حركة وارد» قبل المزامنة، وإلا الفرق هيتمسح.
                    </p>
                    <ul className="divide-y rounded-xl border">
                      {report.drift.map((d) => (
                        <li key={d.productId} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-bold">{d.name}</span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            الإجمالي {d.productQty} · المقاسات {d.variantsSum}
                          </span>
                          <Button size="sm" variant="outline" disabled={busyId === d.productId} onClick={() => void resync(d.productId)}>
                            {busyId === d.productId ? '...' : 'مزامنة'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {report.purchases.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-sm font-extrabold">أوامر شراء من غير تحديد المقاس ({report.purchases.length})</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      الكميات دي دخلت على المنتج بس وممكن تكون ضاعت من المخزون. وزّعها على المقاسات من «حركة وارد» (من غير أمر شراء جديد).
                    </p>
                    <ul className="divide-y rounded-xl border">
                      {report.purchases.map((p, i) => (
                        <li key={`${p.orderNo}-${p.productId}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {p.orderNo} · {p.createdAt} · {p.quantity - p.returnedQty} قطعة
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {report.negative.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-sm font-extrabold">أرصدة سالبة ({report.negative.length})</h3>
                    <ul className="divide-y rounded-xl border">
                      {report.negative.map((n, i) => (
                        <li key={`${n.productId}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-bold">{n.name}</span>
                          <span className="tabular-nums text-xs font-bold text-red-600">{n.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {report.reviewCount > 0 && (
                  <p className="rounded-xl bg-amber-500/10 p-3 text-sm font-medium text-amber-900 dark:text-amber-200">
                    {report.reviewCount} حركة يدوية من الموظفين تحتاج مراجعة — افتح تبويب «الحركات» واختار «تحتاج مراجعة».
                  </p>
                )}
              </>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
