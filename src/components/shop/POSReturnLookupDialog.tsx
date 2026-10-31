'use client'

/**
 * 🔁 2026-10-31 — بحث فاتورة لغرض المرتجع من نقطة البيع.
 *
 * المشكلة: كاشير بصلاحية «نقطة البيع فقط» مش شايف سجل المبيعات (المبيعات
 * والأرباح بتاعة المالك) — والمرتجع زمان بيتعمل من هناك بس. فالعميل بيرجع
 * بالفاتورة والكاشير معندوش طريقة يستلمه.
 *
 * الحل الذكي: زرار صغير جوه نقطة البيع بيفتح الديالوج ده — تكتب/تمسح رقم
 * الفاتورة، بنجيب الفاتورة دي *بس* من /api/sales/returns/lookup (بدون أي
 * تكاليف أو أرباح أو قوائم مبيعات)، وبعدها بنفتح نفس دايلوج المرتجع المعتمد
 * (SaleReturnDialog) بالظبط — نفس القواعد، نفس محرك السيرفر، ونفس سجل التدقيق
 * (مين رجّع وامتى بيتسجل باسم الكاشير).
 *
 * الكاشير هنا مش بيشوف سجل مبيعات — بيشوف فاتورة واحدة بس هي اللي هيرجّعها.
 */

import * as React from 'react'
import { Loader2, RotateCcw, ScanBarcode } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { DialogHero } from './sale-dialog-ui'
import type { SaleLookupSale } from './pos-return-types'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** لقينا الفاتورة — الابن بيقفل الديالوج ده ويفتح دايلوج المرتجع المعتمد */
  onFound: (sale: SaleLookupSale) => void
}

export function POSReturnLookupDialog({ open, onOpenChange, onFound }: Props) {
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // كل مرة يفتح: نبدأ نضيف
  React.useEffect(() => {
    if (open) {
      setQ('')
      setError(null)
    }
  }, [open])

  const search = async () => {
    const query = q.trim()
    if (!query || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ sale: SaleLookupSale }>(
        `/api/sales/returns/lookup?q=${encodeURIComponent(query)}`,
      )
      if (!res?.sale) {
        setError('الفاتورة غير موجودة')
        return
      }
      if (res.sale.status === 'مرتجعة') {
        setError('الفاتورة دي مرتجعة بالفعل — كله رجع من قبل كده.')
        return
      }
      onFound(res.sale)
    } catch (e: any) {
      setError(e?.message || 'مفيش فاتورة بالرقم ده — راجع الورقة وجرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={RotateCcw}
          title="مرتجع فاتورة"
          subtitle="اكتب رقم الفاتورة من ورقها (أو امسحه) — هتظهر لك هي بس، وتحدد بعدها اللي هيرجع وإزاي."
        />

        <form
          className="flex flex-1 flex-col gap-3 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <label className="text-xs font-bold text-foreground/80" htmlFor="pos-return-invoice-q">
            رقم الفاتورة
          </label>
          <div dir="ltr" className="relative">
            <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pos-return-invoice-q"
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                if (error) setError(null)
              }}
              placeholder="SHOP-2026-00012 أو 00012"
              className="ps-9 text-start font-bold tabular-nums"
              inputMode="text"
              autoComplete="off"
              disabled={busy}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              المرتجع بيرجع البضاعة للمخزن فوراً، وبيتسجل باسمك في سجل النظام.
            </p>
            <Button type="submit" disabled={busy || !q.trim()} className="shrink-0">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              بحث
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
