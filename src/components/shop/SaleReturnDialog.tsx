'use client'

/**
 * 🛡️ 2026-09-30 (C9/C10 — إعادة بناء بنموذج الموردين):
 * مرتجع عميل جزئي/كلي مربوط بالفاتورة — زي PurchaseReturnDialog:
 *   - كل أصناف الفاتورة ظاهرة قدام بعض، ولكل سطر كميته المرتجعة (0 … المتبقي).
 *   - زرار "رجّع كل المتبقي" = مرتجع كلي للفاتورة.
 *   - الفاتورة الآجلة: القيمة بتخصم من حساب العميل (الدين بيقل)، والرد الكاش
 *     اختياري ومحدود بـ(المدفوع − المسترد) — السيرفر هو اللي بيحسب وبيحدد.
 *   - فاتورة بدون عميل: القيمة كلها ترجع كاش (محدود بالمدفوع الفعلي).
 *
 * 2026-10: واجهة جديدة بنفس تركيبة دايلوج مرتجع المشتريات وبهوية صفحة المبيعات
 * (فحمي + أصفر). المنطق والتحقق والـ API زي ما هم بالظبط — اتغيّر الشكل بس،
 * وزاد اختيار صريح "يخصمها من حساب العميل / رجّع للعميل فلوس".
 */

import * as React from 'react'
import { Info, Loader2, RotateCcw, Search, Users, Wallet, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DecimalInput, DialogHero, MethodPills, SectionTitle, Stepper } from './sale-dialog-ui'

export interface SaleReturnItem {
  id: number
  productId?: number | null
  name: string
  price: number
  quantity: number
  returnedQty?: number
  unitLabel?: string | null
  unitQuantity?: number | null
}

export interface SaleReturnSaleInfo {
  id: number
  invoiceNo?: string | null
  customerId?: number | null
  customerName?: string | null
  /** الكاش اللي دخل الخزنة فعلاً على الفاتورة دي لحد الآن */
  paid: number
  /** الكاش اللي خرج بالفعل عبر مرتجعات سابقة */
  refunded?: number
  /** طريقة دفع الفاتورة — بتكون الطريقة الافتراضية للرد */
  paymentMethod?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  onDone?: () => void
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** من هنا وطالع: قايمة طويلة (فاتورة جملة) → صفوف مضغوطة + بحث + تمرير داخلي */
const BIG_LIST = 8

const ghostBtn =
  'rounded-full border bg-background text-xs font-bold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-400/50'

export function SaleReturnDialog({ open, onOpenChange, sale, items, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* DialogContent بيفك التركيب لما يقفل، فالفورم بيبدأ نضيف كل مرة؛
            key بيغطي تبديل الفواتير. */}
        <ReturnForm
          key={sale.id}
          sale={sale}
          items={items}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  )
}

function ReturnForm({
  sale,
  items,
  onClose,
  onDone,
}: {
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  onClose: () => void
  onDone?: () => void
}) {
  const [qtys, setQtys] = React.useState<Record<number, string>>({})
  const [refund, setRefund] = React.useState('')
  const [refundTouched, setRefundTouched] = React.useState(false)
  // واجهة فقط: هل المستخدم اختار "رجّع للعميل فلوس"؟
  const [cashMode, setCashMode] = React.useState(false)
  const [refundMethod, setRefundMethod] = React.useState(sale.paymentMethod || 'cash')
  const [note, setNote] = React.useState('')
  const [itemQ, setItemQ] = React.useState('')
  const [onlySel, setOnlySel] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const inFlight = React.useRef(false) // حاجز صلب ضد الدوس المزدوج

  const remainingOf = (it: SaleReturnItem) => Math.max(0, it.quantity - (it.returnedQty ?? 0))

  const qtyOf = (it: SaleReturnItem) =>
    Math.min(remainingOf(it), Math.max(0, Math.floor(Number(qtys[it.id]) || 0)))

  const setQty = (it: SaleReturnItem, n: number) =>
    setQtys((p) => ({ ...p, [it.id]: n > 0 ? String(n) : '' }))

  const lines = React.useMemo(() => {
    return items
      .map((it) => {
        const max = Math.max(0, it.quantity - (it.returnedQty ?? 0))
        const q = Math.min(max, Math.max(0, Math.floor(Number(qtys[it.id]) || 0)))
        return { it, q }
      })
      .filter((l) => l.q > 0)
  }, [items, qtys])

  const returnValue = round2(lines.reduce((s, l) => s + l.it.price * l.q, 0))
  const totalQty = lines.reduce((s, l) => s + l.q, 0)

  // 🛡️ الرد الكاش مبيتأكدش أبداً: الافتراضي 0 → القيمة بتخصم من حساب العميل
  // والخزنة متلمسهاش. لو العميل هياخد فلوس فعلاً المستخدم يكتبها (أو يدوس
  // الاختصار). فاتورة بدون عميل = القيمة كلها ترجع كاش.
  const hasCustomer = !!sale.customerId
  const paidNotRefunded = Math.max(0, round2((sale.paid ?? 0) - (sale.refunded ?? 0)))
  const maxRefund = Math.min(returnValue, paidNotRefunded)
  const defaultRefund = hasCustomer ? 0 : maxRefund
  const refundNum = hasCustomer ? (refundTouched ? Number(refund) || 0 : defaultRefund) : maxRefund
  const refundInvalid =
    refundNum < 0 ||
    round2(refundNum) > round2(maxRefund) ||
    (!hasCustomer && round2(refundNum) !== round2(maxRefund))
  const balanceDrop = round2(returnValue - refundNum)
  const cashShort = !hasCustomer && paidNotRefunded < returnValue
  const cashEmpty = hasCustomer && cashMode && refundNum <= 0

  const anyRemaining = items.some((it) => remainingOf(it) > 0)
  const allSelected =
    anyRemaining && items.every((it) => remainingOf(it) === 0 || qtyOf(it) === remainingOf(it))

  const big = items.length > BIG_LIST
  const needle = itemQ.trim().toLowerCase()
  const shownItems = items.filter((it) => {
    if (needle && !it.name.toLowerCase().includes(needle)) return false
    if (big && onlySel && qtyOf(it) <= 0) return false
    return true
  })

  const setAll = () => {
    const next: Record<number, string> = {}
    for (const it of items) {
      const r = remainingOf(it)
      if (r > 0) next[it.id] = String(r)
    }
    setQtys(next)
  }

  const chooseDeduct = () => {
    setCashMode(false)
    setRefundTouched(true)
    setRefund('0')
  }
  const chooseCash = () => {
    setCashMode(true)
    setRefundTouched(true)
    setRefund((prev) => (Number(prev) > 0 ? prev : ''))
  }

  const blockReason =
    lines.length === 0
      ? 'اختار كمية من صنف واحد على الأقل'
      : refundInvalid
        ? `المبلغ المسترد لازم يكون بين صفر و ${formatCurrency(maxRefund)}`
        : cashEmpty
          ? 'اكتب المبلغ اللي العميل استلمه فعلاً'
          : null

  const submit = async () => {
    if (inFlight.current) return
    if (lines.length === 0) {
      toast.error('اختر كمية للإرجاع من صنف واحد على الأقل')
      return
    }
    if (refundInvalid) {
      toast.error(
        !hasCustomer
          ? `فاتورة بدون عميل — المسترد لازم يساوي المدفوع المتاح (${formatCurrency(maxRefund)})`
          : `المسترد لازم يكون بين صفر و ${formatCurrency(maxRefund)} (المدفوع فعلاً على الفاتورة ولم يُسترد)`,
      )
      return
    }
    if (cashEmpty) {
      toast.error('اكتب المبلغ اللي العميل استلمه، أو اختار الخصم من حسابه')
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      await api('/api/sales/returns', {
        method: 'POST',
        body: {
          saleId: sale.id,
          lines: lines.map((l) => ({ saleItemId: l.it.id, quantity: l.q })),
          refund: round2(refundNum),
          refundMethod: refundNum > 0 ? refundMethod : undefined,
          note: note.trim() || undefined,
        },
      })
      toast.success('تم تسجيل مرتجع العميل')
      onDone?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل المرتجع')
      inFlight.current = false
    } finally {
      setSaving(false)
    }
  }

  const showBar = (hasCustomer || balanceDrop > 0) && (refundNum > 0 || balanceDrop > 0)

  return (
    <>
      <DialogHero
        icon={RotateCcw}
        title="مرتجع عميل"
        chip={sale.invoiceNo ?? `#${sale.id}`}
        subtitle="الكمية المرتجعة بترجع للمخزن، وبعدها تحدّد القيمة هتتسوّى إزاي."
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
        {/* ═════════ 1) الأصناف ═════════ */}
        <section>
          <SectionTitle
            n={1}
            aside={
              anyRemaining && (
                <button
                  type="button"
                  onClick={() => (allSelected ? setQtys({}) : setAll())}
                  className={cn(ghostBtn, 'h-8 px-3')}
                >
                  {allSelected ? 'إلغاء التحديد' : 'رجّع كل المتبقي'}
                </button>
              )
            }
          >
            الأصناف المراد إرجاعها
          </SectionTitle>

          {big && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="relative flex h-10 min-w-[11rem] flex-1 items-center rounded-xl border bg-background transition-shadow focus-within:border-yellow-500 focus-within:ring-[3px] focus-within:ring-yellow-400/30">
                <Search className="pointer-events-none absolute start-3 size-4 text-foreground/60" aria-hidden />
                <input
                  value={itemQ}
                  onChange={(e) => setItemQ(e.target.value)}
                  placeholder={`دوّر في ${items.length} صنف…`}
                  aria-label="بحث في أصناف الفاتورة"
                  className="h-full w-full bg-transparent pe-9 text-sm outline-none placeholder:text-muted-foreground/80"
                  style={{ paddingInlineStart: '2.5rem' }}
                />
                {itemQ && (
                  <button
                    type="button"
                    onClick={() => setItemQ('')}
                    aria-label="مسح البحث"
                    className="absolute end-2 flex size-6 items-center justify-center rounded-full text-foreground/60 hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </label>
              <button
                type="button"
                aria-pressed={onlySel}
                onClick={() => setOnlySel((v) => !v)}
                disabled={lines.length === 0 && !onlySel}
                className={cn(
                  ghostBtn,
                  'h-10 px-3.5 disabled:cursor-not-allowed disabled:opacity-40',
                  onlySel && 'border-yellow-500 bg-yellow-300/25 text-foreground'
                )}
              >
                المحدد فقط ({lines.length})
              </button>
            </div>
          )}

          {shownItems.length === 0 && (
            <p className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm font-medium text-foreground/65">
              {onlySel && !needle ? 'لسه مختارتش أي صنف' : 'مفيش صنف بالاسم ده'}
            </p>
          )}

          <ul
            className={cn(
              big ? 'max-h-[17rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-1.5' : 'space-y-2.5',
              shownItems.length === 0 && 'hidden'
            )}
          >
            {shownItems.map((it) => {
              const remaining = remainingOf(it)
              const prev = it.returnedQty ?? 0
              const q = qtyOf(it)
              const on = q > 0
              const pctPrev = it.quantity > 0 ? (prev / it.quantity) * 100 : 0
              const pctNow = it.quantity > 0 ? (q / it.quantity) * 100 : 0
              const pctKeep = Math.max(0, 100 - pctPrev - pctNow)
              if (big) {
                return (
                  <li
                    key={it.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-transparent px-3 py-2 transition-colors',
                      on ? 'border-yellow-400 bg-yellow-300/10' : 'hover:bg-muted/50',
                      remaining <= 0 && 'opacity-60'
                    )}
                  >
                    <div className="min-w-[8rem] flex-1">
                      <p className="truncate text-sm font-bold">{it.name}</p>
                      <p className="text-[11.5px] font-medium tabular-nums text-foreground/65">
                        {formatCurrency(it.price)} · متاح {remaining} من {it.quantity}
                        {prev > 0 && <span className="text-foreground/50"> · رجع {prev}</span>}
                        {on && (
                          <b className="ms-2 font-extrabold text-rose-600 dark:text-rose-300">
                            −{formatCurrency(q * it.price)}
                          </b>
                        )}
                      </p>
                    </div>
                    {remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        <Stepper
                          value={q}
                          min={0}
                          max={remaining}
                          onChange={(n) => setQty(it, n)}
                          label={`كمية مرتجع ${it.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setQty(it, remaining)}
                          disabled={q === remaining}
                          className={cn(
                            ghostBtn,
                            'h-10 rounded-xl px-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background'
                          )}
                        >
                          الكل
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-lg bg-zinc-500/15 px-2.5 py-1 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                        مرتجع بالكامل
                      </span>
                    )}
                  </li>
                )
              }
              return (
                <li
                  key={it.id}
                  className={cn(
                    'rounded-2xl border bg-card p-3.5 transition-colors',
                    on && 'border-yellow-400 bg-yellow-300/10',
                    remaining <= 0 && 'bg-muted/40'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
                    <div className="min-w-[9rem] flex-1">
                      <p className="truncate text-sm font-extrabold">{it.name}</p>
                      <p className="mt-0.5 text-xs font-medium tabular-nums text-foreground/65">
                        {formatCurrency(it.price)} للقطعة · اتباع {it.quantity}
                      </p>
                    </div>

                    {remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        <Stepper
                          value={q}
                          min={0}
                          max={remaining}
                          onChange={(n) => setQty(it, n)}
                          label={`كمية مرتجع ${it.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setQty(it, remaining)}
                          disabled={q === remaining}
                          className={cn(
                            ghostBtn,
                            'h-10 rounded-xl px-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background'
                          )}
                        >
                          الكل
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-lg bg-zinc-500/15 px-2.5 py-1 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                        مرتجع بالكامل
                      </span>
                    )}
                  </div>

                  {/* شريط الكمية: المتاح | هترجّعه الآن | رجع قبل كده */}
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="h-full bg-yellow-400" style={{ width: `${pctKeep}%` }} />
                    <span
                      className="h-full bg-rose-500 transition-[width] duration-300 motion-reduce:transition-none"
                      style={{ width: `${pctNow}%` }}
                    />
                    <span className="h-full bg-zinc-400" style={{ width: `${pctPrev}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium tabular-nums">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground/70">
                      {remaining > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <i aria-hidden className="size-2 rounded-full bg-yellow-400" />
                          متاح للإرجاع {remaining} من {it.quantity}
                        </span>
                      )}
                      {prev > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <i aria-hidden className="size-2 rounded-full bg-zinc-400" />
                          رجع قبل كده {prev}
                        </span>
                      )}
                    </span>
                    {on && (
                      <b className="text-sm font-extrabold text-rose-600 dark:text-rose-300">
                        −{formatCurrency(q * it.price)}
                      </b>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {/* ═════════ 2) التسوية ═════════ */}
        <section>
          <SectionTitle n={2}>التسوية</SectionTitle>

          {lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
              <RotateCcw className="mx-auto size-6 text-foreground/40" aria-hidden />
              <p className="mt-2 text-sm font-bold">اختار كمية من صنف</p>
              <p className="mt-0.5 text-xs font-medium text-foreground/65">
                وهتظهر هنا قيمة المرتجع وإزاي هتتسوّى.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-3 bg-yellow-300/15 px-4 py-3.5">
                <div>
                  <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
                  <p className="text-2xl font-extrabold tabular-nums">
                    {num(returnValue)}
                    <span className="ms-1 text-xs font-semibold text-foreground/60">جنيه</span>
                  </p>
                </div>
                <p className="text-xs font-semibold tabular-nums text-foreground/65">
                  {totalQty} قطعة من {lines.length} صنف
                </p>
              </div>

              <div className="space-y-4 p-4">
                {hasCustomer ? (
                  <>
                    <p className="text-sm font-extrabold">القيمة دي هتتسوّى إزاي مع العميل؟</p>
                    <div role="radiogroup" aria-label="طريقة التسوية" className="grid gap-2.5 sm:grid-cols-2">
                      <ChoiceCard
                        on={!cashMode}
                        onClick={chooseDeduct}
                        icon={Users}
                        title="تتخصم من حسابه"
                        desc="من اللي عليه — مفيش فلوس بتتحرك"
                      />
                      <ChoiceCard
                        on={cashMode}
                        disabled={paidNotRefunded <= 0}
                        onClick={chooseCash}
                        icon={Wallet}
                        title="رجّع له فلوس"
                        desc={
                          paidNotRefunded > 0
                            ? `تقدر ترد لحد ${formatCurrency(paidNotRefunded)} من اللي اتدفع`
                            : 'مفيش مدفوع على الفاتورة دي يتردّ'
                        }
                      />
                    </div>

                    {cashMode && (
                      <div className="space-y-2.5 rounded-xl border border-dashed p-3.5">
                        <label htmlFor="sr-refund" className="block text-xs font-bold">
                          المبلغ اللي العميل استلمه فعلاً
                        </label>
                        <DecimalInput
                          id="sr-refund"
                          value={refundNum}
                          onChange={(n) => {
                            setRefundTouched(true)
                            setRefund(String(n))
                          }}
                          suffix="جنيه"
                          invalid={refundInvalid}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {maxRefund > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundTouched(true)
                                setRefund(String(round2(maxRefund)))
                              }}
                              className={cn(ghostBtn, 'h-8 px-3')}
                            >
                              العميل استلم كل المبلغ ({formatCurrency(maxRefund)})
                            </button>
                          )}
                          {refundInvalid && (
                            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                              المبلغ لازم يكون بين صفر و {formatCurrency(maxRefund)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl bg-yellow-300/20 p-3 text-xs font-medium leading-relaxed text-foreground/80">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    الفاتورة دي من غير عميل، فالقيمة بترجع كاش من المدفوع المتاح ({formatCurrency(maxRefund)}).
                  </div>
                )}

                {cashShort && (
                  <p className="rounded-xl border border-warning-subtle bg-warning-subtle/20 p-3 text-xs font-medium leading-relaxed">
                    فاتورة بدون عميل والمدفوع عليها أقل من قيمة المرتجع — سيُرد المدفوع المتاح (
                    {formatCurrency(paidNotRefunded)}) والباقي يتسجل كقيمة مرتجعة بدون رد نقدي.
                  </p>
                )}

                {refundNum > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold">رجّعت الفلوس للعميل إزاي؟</p>
                    <MethodPills value={refundMethod} onChange={setRefundMethod} label="طريقة رد المبلغ" />
                  </div>
                )}
              </div>

              {/* النتيجة بعد التأكيد */}
              <div className="space-y-3 border-t bg-muted/30 p-4">
                <p className="text-xs font-bold text-foreground/70">بعد التأكيد</p>
                {showBar && (
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {refundNum > 0 && (
                      <span className="h-full bg-zinc-800 dark:bg-zinc-200" style={{ flexGrow: refundNum, flexBasis: 0 }} />
                    )}
                    {balanceDrop > 0 && (
                      <span className="h-full bg-yellow-400" style={{ flexGrow: balanceDrop, flexBasis: 0 }} />
                    )}
                  </div>
                )}
                <ul className="space-y-2 text-sm">
                  <ResultLine
                    dot="bg-zinc-800 dark:bg-zinc-200"
                    label="يخرج من الخزنة"
                    value={formatCurrency(refundNum > 0 ? refundNum : 0)}
                  />
                  {hasCustomer ? (
                    <ResultLine
                      dot="bg-yellow-400"
                      label={`يتخصم من حساب العميل${sale.customerName ? ` (${sale.customerName})` : ''}`}
                      value={formatCurrency(Math.max(0, balanceDrop))}
                    />
                  ) : (
                    balanceDrop > 0 && (
                      <ResultLine
                        dot="bg-yellow-400"
                        label="قيمة مرتجعة بدون رد نقدي"
                        value={formatCurrency(balanceDrop)}
                      />
                    )
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* ═════════ 3) ملاحظات ═════════ */}
        <section>
          <SectionTitle n={3}>ملاحظات</SectionTitle>
          <input
            id="sr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="سبب المرتجع (اختياري) — مثال: صنف تالف / العميل غيّر رأيه"
            aria-label="سبب المرتجع"
            className="h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-yellow-500 focus:ring-[3px] focus:ring-yellow-400/30"
          />
        </section>
      </div>

      {/* ═════════ الشريط السفلي ═════════ */}
      <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
        {blockReason && (
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {blockReason}
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
            <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(returnValue)}</p>
          </div>
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-11 rounded-xl px-5">
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={saving || lines.length === 0 || refundInvalid || cashEmpty}
            className="h-11 rounded-xl bg-zinc-900 px-6 font-bold text-yellow-300 hover:bg-zinc-800 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-yellow-300 dark:text-zinc-900 dark:hover:bg-yellow-200"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            تأكيد المرتجع
          </Button>
        </div>
      </div>
    </>
  )
}

/* ───────────── مكوّنات محلية ───────────── */

function ChoiceCard({
  on,
  disabled,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-400/50 disabled:cursor-not-allowed disabled:opacity-50',
        on
          ? 'border-yellow-400 bg-yellow-300/15 ring-1 ring-yellow-400/60'
          : 'bg-background hover:bg-muted/60 disabled:hover:bg-background'
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          on ? 'bg-yellow-300 text-zinc-900' : 'bg-muted text-foreground/70'
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-relaxed text-foreground/65">{desc}</span>
      </span>
    </button>
  )
}

function ResultLine({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', dot)} />
      <span className="font-semibold text-foreground/80">{label}</span>
      <span aria-hidden className="mb-0.5 h-px flex-1 border-b border-dotted border-foreground/25" />
      <b className="font-extrabold tabular-nums">{value}</b>
    </li>
  )
}
