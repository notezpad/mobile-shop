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
 *
 * 🔄 2026-10-31 (التحديث التاسع): **الاستبدال** — زرار "استبدال بضاعة" بيفتح
 * قسم بحث عن بضاعة بديلة (نفس كتالوج نقطة البيع، بالألوان/المقاسات عبر
 * POSVariantPickerDialog). الصافي = قيمة المرتجع − قيمة البديل، والسيرفر هو
 * اللي بيحسمه بنفس معادلة محرك /api/sales/returns (اللي كان بيدعم exchange
 * من غير واجهة أصلاً):
 *   - متكافئ         → مفيش أي فلوس بتتحرك.
 *   - البديل أغلى    → فرق عليه العميل: بيتسجل على حسابه (فاتورة بعميل)
 *                       أو بيتحصّل كاش/فودافون كاش… (فاتورة بدون عميل).
 *   - البديل أرخص    → بقيت المرتجع تتسوّى زي ما هي (حساب العميل أو رد كاش).
 * من غير استبدال: الدايلوج زي ما هو بالظبط — نفس الحسابات ونفس الـ payload.
 *
 * 🖨️ 2026-10-31 (التحديث العاشر): بعد تأكيد الاستبدال بيطبع **إيصال
 * استبدال** لوحده (زي فاتورة البيع بالظبط): أسطر المرتجع اللي راجع للمخزن،
 * وأسطر البديل اللي خرج من المخزن، والفرق (تحصيل/رد/حساب العميل/متكافئ) —
 * حرارية USB لو متظبطة وإلا طباعة متصفح بإطار مخفي. الأرقام من رد السيرفر.
 */

import * as React from 'react'
import { commonUnit, formatQtyUnit } from '@/lib/unit-label'
import { ArrowLeftRight, Info, Loader2, RotateCcw, Search, Users, Wallet, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { defaultPaymentMethodsConfig } from '@/lib/payment-methods'
import { DecimalInput, DialogHero, MethodPills, SectionTitle, Stepper } from './sale-dialog-ui'
import { POSVariantPickerDialog, type PickerVariantLite } from './POSVariantPickerDialog'
import {
  DEFAULT_PRINTER_SETTINGS,
  getStoredPrinterSettings,
  printThermalExchangeReceipt,
  printThermalExchangeReceiptBrowser,
  usbErrorMessage,
  type ThermalExchangeReceiptData,
} from '@/lib/thermal-printer'

export interface SaleReturnItem {
  id: number
  productId?: number | null
  name: string
  price: number
  quantity: number
  returnedQty?: number
  unitLabel?: string | null
  unitQuantity?: number | null
  // 🥬 وحدة المنتج وقت البيع (علبة/كيس/...) — null = قطعة
  pieceLabel?: string | null
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

/** 🖨️ بيانات إيصال الاستبدال — بتتبعت من نقطة البيع وسجل المبيعات
 *  (اسم المحل/التليفون/العنوان من هوية المحل، والموظف اللي عمل العملية). */
export interface ExchangePrintContext {
  shopName: string
  shopPhone?: string | null
  shopAddress?: string | null
  cashierName?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  onDone?: () => void
  printContext?: ExchangePrintContext
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** سعر بيع بضاعة الاستبدال كما تظهر في نقطة البيع (سعر التجزئة الديناميكي لو موجود). */
const exPriceOf = (p: ExProduct) => p.dynamicRetailPrice ?? p.price

/** نتيجة مبسّطة للبحث عن بضاعة الاستبدال — نفس حقول /api/products?pos=1. */
export interface ExProduct {
  id: number
  name: string
  barcode?: string | null
  price: number
  quantity: number
  dynamicRetailPrice?: number | null
  // 🥬 استبدال بالوزن — الكمية بتقبل كسور
  soldByWeight?: boolean
  unitLabel?: string | null
}

/** سطر بضاعة بديلة مختار جوه الدايلوج. */
export interface ExchLine {
  key: string // `${productId}:${variantId ?? 0}`
  productId: number
  variantId: number | null
  name: string
  variantLabel: string | null
  price: number
  quantity: number
  /** المخزون المتاح وقت الإضافة (حد ناعم — السيرفر هو المرجع النهائي) */
  maxQty: number | null
  soldByWeight: boolean
  unitLabel: string | null
}

/** من هنا وطالع: قايمة طويلة (فاتورة جملة) → صفوف مضغوطة + بحث + تمرير داخلي */
const BIG_LIST = 8

const ghostBtn =
  'rounded-full border bg-background text-xs font-bold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-400/50'

export function SaleReturnDialog({ open, onOpenChange, sale, items, onDone, printContext }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* DialogContent بيفك التركيب لما يقفل، فالفورم بيبدأ نضيف كل مرة؛
            key بيغطي تبديل الفواتير. */}
        <ReturnForm
          key={sale.id}
          sale={sale}
          items={items}
          printContext={printContext}
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
  printContext,
  onClose,
  onDone,
}: {
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  printContext?: ExchangePrintContext
  onClose: () => void
  onDone?: () => void
}) {
  const [qtys, setQtys] = React.useState<Record<number, string>>({})
  const [refund, setRefund] = React.useState('')
  const [refundTouched, setRefundTouched] = React.useState(false)
  // واجهة فقط: هل المستخدم اختار "رجّع للعميل فلوس"؟
  const [cashMode, setCashMode] = React.useState(false)
  const [refundMethod, setRefundMethod] = React.useState(sale.paymentMethod || 'cash')
  // 💳 خ-3 (2026-11-02): طرق الرد = وسائل المحل المفعّلة (بطاقة + مخصصة) — موحّدة
  // مع البيع. الافتراضي (طريقة الفاتورة نفسها) بيفضل ظاهر حتى لو مش في القائمة.
  const pmList = useShopStore((s) => s.branding.paymentMethods)
  const refundMethodItems = React.useMemo(() => {
    const usable = (pmList.length > 0 ? pmList : defaultPaymentMethodsConfig())
      .filter((m) => m.pos || m.collect)
      .map((m) => ({ value: m.id, label: m.label }))
    const def = sale.paymentMethod
    if (def && !usable.some((i) => i.value === def)) usable.push({ value: def, label: def })
    return usable
  }, [pmList, sale.paymentMethod])
  const refundMethodLabel = (id: string) =>
    refundMethodItems.find((i) => i.value === id)?.label ?? id
  const [note, setNote] = React.useState('')
  const [itemQ, setItemQ] = React.useState('')
  const [onlySel, setOnlySel] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const inFlight = React.useRef(false) // حاجز صلب ضد الدوس المزدوج

  /* ── 🔄 الاستبدال: بضاعة بديلة تخرج من المخزن مكان اللي بيرجع ── */
  const [exOn, setExOn] = React.useState(false)
  const [exLines, setExLines] = React.useState<ExchLine[]>([])
  const [exQ, setExQ] = React.useState('')
  const [exResults, setExResults] = React.useState<ExProduct[]>([])
  const [exSearching, setExSearching] = React.useState(false)
  const [exOpen, setExOpen] = React.useState(false)
  const [variantPick, setVariantPick] = React.useState<{
    product: ExProduct
    variants: PickerVariantLite[]
  } | null>(null)
  const exCache = React.useRef(new Map<string, ExProduct[]>())

  const exValue = round2(exLines.reduce((s, l) => s + l.price * l.quantity, 0))
  const exQty = exLines.reduce((s, l) => s + l.quantity, 0)
  const exUnit = commonUnit(exLines.map((l) => (l.soldByWeight ? null : l.unitLabel)))

  // بحث بضاعة الاستبدال — نفس endpoint نقطة البيع (بيحترم صلاحية ونطاق الفرع)
  React.useEffect(() => {
    if (!exOn) return
    const q = exQ.trim()
    if (!q) {
      setExResults([])
      setExSearching(false)
      return
    }
    const hit = exCache.current.get(q)
    if (hit) {
      setExResults(hit)
      setExSearching(false)
      return
    }
    setExSearching(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await api<{ data: ExProduct[] } | ExProduct[]>(
          `/api/products?search=${encodeURIComponent(q)}&limit=20&pos=1`,
        )
        const data = (Array.isArray(res) ? res : ((res as any)?.data ?? [])) as ExProduct[]
        if (exCache.current.size > 40) exCache.current.clear()
        exCache.current.set(q, data)
        setExResults(data)
      } catch (e: any) {
        setExResults([])
        // صلاحيات/شبكة — الأمانة أهم من السكوت: «مفيش منتج بالاسم ده» هتضلل
        toast.error(e?.message || 'فشل البحث عن بضاعة الاستبدال')
      } finally {
        setExSearching(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [exQ, exOn])

  const toggleExchange = () =>
    setExOn((v) => {
      if (v) {
        setExLines([])
        setExQ('')
        setExResults([])
      }
      return !v
    })

  const pushExLine = (p: ExProduct, v: { id: number; label: string; quantity: number } | null) =>
    setExLines((prev) => {
      const key = `${p.id}:${v?.id ?? 0}`
      const i = prev.findIndex((l) => l.key === key)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: round3(next[i].quantity + 1) }
        return next
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          variantId: v?.id ?? null,
          name: p.name,
          variantLabel: v?.label ?? null,
          price: round2(exPriceOf(p)),
          quantity: 1,
          maxQty: v ? v.quantity : p.quantity,
          soldByWeight: !!p.soldByWeight,
          unitLabel: p.unitLabel ?? null,
        },
      ]
    })

  const addExProduct = async (p: ExProduct) => {
    if ((p.quantity ?? 0) <= 0) {
      toast.error(`مخزون «${p.name}» خلص`)
      return
    }
    try {
      const vs = await api<any[]>(`/api/products/${p.id}/variants`)
      const variants: PickerVariantLite[] = (vs ?? []).map((v: any) => ({
        id: v.id,
        size: v.size ?? null,
        color: v.color ?? null,
        quantity: v.quantity,
      }))
      if (variants.length > 0) {
        setVariantPick({ product: p, variants })
        return
      }
    } catch {
      toast.error('فشل تحميل الألوان/المقاسات — جرّب تاني')
      return
    }
    pushExLine(p, null)
    setExQ('')
    setExResults([])
  }

  const setExQty = (key: string, n: number) =>
    setExLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(0.001, round3(n)) } : l)),
    )

  const removeExLine = (key: string) => setExLines((prev) => prev.filter((l) => l.key !== key))

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
  const qtyUnit = commonUnit(lines.map((l) => (l.it.unitQuantity ? null : l.it.pieceLabel)))

  // 🛡️ الرد الكاش مبيتأكدش أبداً: الافتراضي 0 → القيمة بتخصم من حساب العميل
  // والخزنة متلمسهاش. لو العميل هياخد فلوس فعلاً المستخدم يكتبها (أو يدوس
  // الاختصار). فاتورة بدون عميل = القيمة كلها ترجع كاش.
  const hasCustomer = !!sale.customerId
  const paidNotRefunded = Math.max(0, round2((sale.paid ?? 0) - (sale.refunded ?? 0)))
  // 🔄 الاستبدال: الصافي = قيمة المرتجع − قيمة البديل (نفس معادلة السيرفر بالظبط)
  const netReturn = round2(returnValue - exValue)
  const charge = exOn && netReturn < 0 ? round2(-netReturn) : 0
  const settleBase = exOn ? netReturn : returnValue
  const maxRefund = settleBase > 0 ? Math.min(settleBase, paidNotRefunded) : 0
  const defaultRefund = hasCustomer ? 0 : maxRefund
  const refundNum =
    settleBase > 0
      ? hasCustomer
        ? refundTouched
          ? Number(refund) || 0
          : defaultRefund
        : maxRefund
      : 0
  const refundInvalid =
    settleBase > 0 &&
    (refundNum < 0 ||
      round2(refundNum) > round2(maxRefund) ||
      (!hasCustomer && round2(refundNum) !== round2(maxRefund)))
  const balanceDrop = round2(settleBase - refundNum)
  const cashShort = !hasCustomer && settleBase > 0 && paidNotRefunded < settleBase
  const cashEmpty = hasCustomer && cashMode && settleBase > 0 && refundNum <= 0

  const anyRemaining = items.some((it) => remainingOf(it) > 0)
  const allSelected =
    anyRemaining && items.every((it) => remainingOf(it) === 0 || qtyOf(it) === remainingOf(it))

  const big = items.length > BIG_LIST // بحث + "المحدد فقط"
  const compact = items.length > 3 // صفوف مضغوطة + تمرير داخلي
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

  /**
   * 🖨️ إيصال الاستبدال — أسطر المرتجع + أسطر البديل + الفرق.
   * نفس نمط طباعة نقطة البيع بالظبط: حرارية USB لو متظبطة، وإلا طباعة
   * متصفح بإطار مخفي. الأرقام كلها من رد السيرفر (اللي حصل فعلاً) —
   * والطباعة عمرها ما توقف تسجيل العملية (catch صامت زي فاتورة البيع).
   */
  const printExchangeSlip = (res: {
    returnId?: number
    total?: number
    exchangeTotal?: number
    refund?: number
    charge?: number
    creditApplied?: number
  } | null) => {
    if (!printContext) return
    const data: ThermalExchangeReceiptData = {
      shopName: printContext.shopName || 'محل',
      shopPhone: printContext.shopPhone || undefined,
      shopAddress: printContext.shopAddress || undefined,
      invoiceNo: sale.invoiceNo ?? String(sale.id),
      returnId: res?.returnId,
      date: new Date().toLocaleString('ar-EG'),
      returnedItems: lines.map((l) => ({
        name: l.it.name,
        qty: l.q,
        price: l.it.price,
        total: round2(l.it.price * l.q),
      })),
      exchangeItems: exLines.map((l) => ({
        name: l.variantLabel ? `${l.name} — ${l.variantLabel}` : l.name,
        qty: l.quantity,
        price: l.price,
        total: round2(l.price * l.quantity),
      })),
      returnValue: res?.total ?? returnValue,
      exchangeTotal: res?.exchangeTotal ?? exValue,
      refund: res?.refund ?? 0,
      // طريقة رد/تحصيل الفرق — نفس اللي اتبعت للسيرفر
      refundMethod: refundNum > 0 || charge > 0 ? refundMethod : sale.paymentMethod ?? 'cash',
      creditApplied: res?.creditApplied ?? 0,
      charge: res?.charge ?? 0,
      hasCustomer,
      customerName: sale.customerName || undefined,
      cashierName: printContext.cashierName || undefined,
      note: note.trim() || undefined,
    }
    const ts = getStoredPrinterSettings()
    if (ts.width) {
      printThermalExchangeReceipt(data, ts)
        .then((outcome) => {
          if (outcome.mode === 'browser' && outcome.usbError) {
            toast.warning('فشلت طباعة USB — فتحنا نافذة الطباعة بدلاً منها', {
              description: usbErrorMessage(outcome.usbError),
            })
          }
        })
        .catch(() => {})
      return
    }
    try {
      printThermalExchangeReceiptBrowser(data, { ...DEFAULT_PRINTER_SETTINGS, ...ts })
    } catch {
      /* الطباعة عمرها ما توقف تسجيل العملية */
    }
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
      const hasExchange = exOn && exLines.length > 0
      const res = await api<{
        returnId: number
        total: number
        exchangeTotal: number
        refund: number
        charge: number
        creditApplied: number
      }>('/api/sales/returns', {
        method: 'POST',
        body: {
          saleId: sale.id,
          lines: lines.map((l) => ({ saleItemId: l.it.id, quantity: l.q })),
          refund: round2(refundNum),
          // طريقة الرد/التحصيل — بتتسخدم كمان لتحصيل فرق الاستبدال (فاتورة بدون عميل)
          refundMethod: refundNum > 0 || charge > 0 ? refundMethod : undefined,
          exchange: hasExchange
            ? exLines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId ?? undefined,
                quantity: l.quantity,
                price: l.price,
              }))
            : undefined,
          note: note.trim() || undefined,
        },
      })
      if (hasExchange) {
        const bits: string[] = []
        if (res?.charge > 0)
          bits.push(
            `فرق ${formatCurrency(res.charge)} ${hasCustomer ? 'اتسجل على حساب العميل' : 'اتحصّل'}`,
          )
        if (res?.refund > 0) bits.push(`ردّ ${formatCurrency(res.refund)} للعميل`)
        if (res?.creditApplied > 0) bits.push(`${formatCurrency(res.creditApplied)} خصمت من حساب العميل`)
        toast.success(bits.length ? `تم تسجيل الاستبدال — ${bits.join(' · ')}` : 'تم تسجيل الاستبدال (متكافئ)')
        // 🖨️ إيصال الاستبدال بيطبع لوحده — زي فاتورة البيع بالظبط
        printExchangeSlip(res)
      } else {
        toast.success('تم تسجيل مرتجع العميل')
      }
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
        subtitle="الكمية المرتجعة بترجع للمخزن — وبعدها تحدّد التسوية، أو فعّل «استبدال بضاعة» لو العميل عايز بضاعة تانية مكانها."
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
        {/* ═════════ 1) الأصناف ═════════ */}
        <section>
          <SectionTitle
            n={1}
            aside={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={exOn}
                  onClick={toggleExchange}
                  className={cn(
                    ghostBtn,
                    'inline-flex h-8 items-center gap-1.5 px-3',
                    exOn && 'border-yellow-500 bg-yellow-300/25 text-foreground'
                  )}
                >
                  <ArrowLeftRight className="size-3.5" aria-hidden />
                  استبدال بضاعة
                </button>
                {anyRemaining && (
                  <button
                    type="button"
                    onClick={() => (allSelected ? setQtys({}) : setAll())}
                    className={cn(ghostBtn, 'h-8 px-3')}
                  >
                    {allSelected ? 'إلغاء التحديد' : 'رجّع كل المتبقي'}
                  </button>
                )}
              </div>
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
              compact ? 'max-h-[17rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-1.5' : 'space-y-2.5',
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
              if (compact) {
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
                        {formatCurrency(it.price)} {it.pieceLabel && !it.unitQuantity ? `لل${it.pieceLabel}` : 'للقطعة'} · اتباع {it.quantity}
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

        {/* ═════════ 2) بضاعة الاستبدال (اختياري) ═════════ */}
        {exOn && (
          <section>
            <SectionTitle
              n={2}
              aside={
                exLines.length > 0 && (
                  <span className="text-xs font-semibold tabular-nums text-foreground/65">
                    {formatQtyUnit(exQty, exUnit)} بديل
                  </span>
                )
              }
            >
              بضاعة الاستبدال
            </SectionTitle>

            <div className="relative">
              <label className="relative flex h-10 items-center rounded-xl border bg-background transition-shadow focus-within:border-yellow-500 focus-within:ring-[3px] focus-within:ring-yellow-400/30">
                <Search className="pointer-events-none absolute start-3 size-4 text-foreground/60" aria-hidden />
                <input
                  value={exQ}
                  onChange={(e) => setExQ(e.target.value)}
                  onFocus={() => setExOpen(true)}
                  onBlur={() => window.setTimeout(() => setExOpen(false), 150)}
                  placeholder="دوّر على البضاعة البديلة بالاسم أو الباركود…"
                  aria-label="بحث عن بضاعة الاستبدال"
                  className="h-full w-full bg-transparent pe-9 text-sm outline-none placeholder:text-muted-foreground/80"
                  style={{ paddingInlineStart: '2.5rem' }}
                />
                {exQ && (
                  <button
                    type="button"
                    onClick={() => {
                      setExQ('')
                      setExResults([])
                    }}
                    aria-label="مسح بحث الاستبدال"
                    className="absolute end-2 flex size-6 items-center justify-center rounded-full text-foreground/60 hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </label>

              {exOpen && exQ.trim() && (exSearching || exResults.length > 0) && (
                <div className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-1.5 shadow-lg">
                  {exSearching && (
                    <p className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-foreground/60">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> جارٍ البحث…
                    </p>
                  )}
                  {!exSearching &&
                    exResults.map((p) => {
                      const out = (p.quantity ?? 0) <= 0
                      return (
                        <button
                          key={p.id}
                          type="button"
                          // onMouseDown بدل onClick — تشتغل قبل blur اللي بيقفل القايمة
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setExOpen(false)
                            void addExProduct(p)
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-muted/60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{p.name}</span>
                            <span className="text-[11.5px] font-medium tabular-nums text-foreground/60">
                              {formatCurrency(exPriceOf(p))}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums',
                              out
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            )}
                          >
                            {out ? 'خلص' : `متاح ${p.quantity}`}
                          </span>
                        </button>
                      )
                    })}
                </div>
              )}
              {exOpen && exQ.trim() && !exSearching && exResults.length === 0 && (
                <p className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-2xl border bg-card px-3 py-2.5 text-center text-xs font-semibold text-foreground/60 shadow-lg">
                  مفيش منتج بالاسم ده
                </p>
              )}
            </div>

            {exLines.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed bg-card/60 px-4 py-6 text-center text-xs font-medium leading-relaxed text-foreground/65">
                العميل هيستلم بضاعة تانية مكان اللي بيرجّعه؟ دوّر عليها فوق وضيفها.
                <br />
                لو مفيش بديل، اقفل زرار «استبدال بضاعة» وكمّل مرتجع عادي.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {exLines.map((l) => (
                  <li
                    key={l.key}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-yellow-400 bg-yellow-300/10 px-3 py-2"
                  >
                    <div className="min-w-[8rem] flex-1">
                      <p className="truncate text-sm font-bold">
                        {l.name}
                        {l.variantLabel && <span className="text-foreground/70"> — {l.variantLabel}</span>}
                      </p>
                      <p className="text-[11.5px] font-medium tabular-nums text-foreground/65">
                        {formatCurrency(l.price)}
                        {l.soldByWeight && ` / ${l.unitLabel || 'كجم'}`}
                        {l.maxQty != null && <> · متاح {l.maxQty}</>}
                        <b className="ms-2 font-extrabold text-emerald-700 dark:text-emerald-300">
                          +{formatCurrency(l.price * l.quantity)}
                        </b>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {l.soldByWeight ? (
                        <DecimalInput
                          className="w-32"
                          value={l.quantity}
                          min={0.001}
                          suffix={l.unitLabel || 'كجم'}
                          onChange={(n) => setExQty(l.key, n)}
                          label={`كمية بديل ${l.name}`}
                        />
                      ) : (
                        <Stepper
                          value={l.quantity}
                          min={1}
                          max={l.maxQty ?? undefined}
                          onChange={(n) => setExQty(l.key, n)}
                          label={`كمية بديل ${l.name}`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeExLine(l.key)}
                        aria-label={`إزالة ${l.name} من الاستبدال`}
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ═════════ التسوية ═════════ */}
        <section>
          <SectionTitle n={exOn ? 3 : 2}>التسوية</SectionTitle>

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
                {exOn && exValue > 0 ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold tabular-nums text-foreground/70">
                      <span>قيمة المرتجع</span>
                      <span>{num(returnValue)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      <span>بضاعة الاستبدال</span>
                      <span>−{num(exValue)}</span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-dashed border-foreground/20 pt-1.5">
                      <p className="text-[11px] font-semibold text-foreground/60">
                        {netReturn >= 0 ? 'صافي المرتجع' : 'فرق على العميل'}
                      </p>
                      <p className="text-2xl font-extrabold tabular-nums">
                        {num(Math.abs(netReturn))}
                        <span className="ms-1 text-xs font-semibold text-foreground/60">جنيه</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
                    <p className="text-2xl font-extrabold tabular-nums">
                      {num(returnValue)}
                      <span className="ms-1 text-xs font-semibold text-foreground/60">جنيه</span>
                    </p>
                  </div>
                )}
                <p className="shrink-0 text-xs font-semibold tabular-nums text-foreground/65">
                  {formatQtyUnit(totalQty, qtyUnit)} من {lines.length} صنف
                  {exOn && exLines.length > 0 && <> · {formatQtyUnit(exQty, exUnit)} بديل</>}
                </p>
              </div>

              <div className="space-y-4 p-4">
                {exOn && netReturn === 0 ? (
                  /* 🔄 استبدال متكافئ — مفيش فلوس تتسيوى أصلاً */
                  <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 p-3 text-xs font-semibold leading-relaxed text-emerald-700 dark:text-emerald-300">
                    <ArrowLeftRight className="mt-0.5 size-4 shrink-0" aria-hidden />
                    الاستبدال متكافئ — قيمة البديل ({formatCurrency(exValue)}) بتغطي قيمة المرتجع
                    بالظبط، ومفيش أي فلوس هتتحرك.
                  </div>
                ) : exOn && netReturn < 0 ? (
                  /* 🔄 البديل أغلى — فرق على العميل */
                  hasCustomer ? (
                    <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-300">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                      قيمة البديل أكبر من قيمة المرتجع بـ {formatCurrency(charge)} — الفرق بيتسجل على
                      حساب العميل{sale.customerName ? ` (${sale.customerName})` : ''} ودين بيزيد،
                      وتقدر تحصّله في أي وقت.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-300">
                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                        قيمة البديل أكبر من قيمة المرتجع — فرق {formatCurrency(charge)} هيتحصّل من
                        العميل عند التأكيد.
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-bold">العميل هيستلم الفرق إزاي؟</p>
                        <MethodPills
                          value={refundMethod}
                          onChange={setRefundMethod}
                          label="طريقة تحصيل الفرق"
                          items={refundMethodItems}
                        />
                      </div>
                    </div>
                  )
                ) : hasCustomer ? (
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
                    <MethodPills
                      value={refundMethod}
                      onChange={setRefundMethod}
                      label="طريقة رد المبلغ"
                      items={refundMethodItems}
                    />
                    {/* 🛡️ خ-3: تحذير لو الرد بطريقة مختلفة عن طريقة دفع الفاتورة الأصلية */}
                    {sale.paymentMethod && refundMethod !== sale.paymentMethod && (
                      <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 dark:text-amber-300">
                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                        الفاتورة اتدفعت بـ «{refundMethodLabel(sale.paymentMethod)}» — والمرتجع
                        هيتسجل رد بـ «{refundMethodLabel(refundMethod)}». اتأكد إن ده مقصود.
                      </div>
                    )}
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
                  {exValue > 0 && (
                    <ResultLine
                      dot="bg-emerald-500"
                      label="بضاعة بديلة خرجت من المخزن"
                      value={formatCurrency(exValue)}
                    />
                  )}
                  <ResultLine
                    dot="bg-zinc-800 dark:bg-zinc-200"
                    label="يخرج من الخزنة"
                    value={formatCurrency(refundNum > 0 ? refundNum : 0)}
                  />
                  {hasCustomer ? (
                    balanceDrop > 0 ? (
                      <ResultLine
                        dot="bg-yellow-400"
                        label={`يتخصم من حساب العميل${sale.customerName ? ` (${sale.customerName})` : ''}`}
                        value={formatCurrency(balanceDrop)}
                      />
                    ) : balanceDrop < 0 ? (
                      <ResultLine
                        dot="bg-rose-500"
                        label={`يتسجل على حساب العميل${sale.customerName ? ` (${sale.customerName})` : ''} — دين زيادة`}
                        value={formatCurrency(-balanceDrop)}
                      />
                    ) : null
                  ) : charge > 0 ? (
                    <ResultLine
                      dot="bg-emerald-500"
                      label="يتحصّل من العميل عند التأكيد"
                      value={formatCurrency(charge)}
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

        {/* ═════════ ملاحظات ═════════ */}
        <section>
          <SectionTitle n={exOn ? 4 : 3}>ملاحظات</SectionTitle>
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
            {exOn && exValue > 0 ? (
              <>
                <p className="text-[11px] font-semibold text-foreground/60">
                  مرتجع {num(returnValue)} − بديل {num(exValue)}
                </p>
                <p className="truncate text-lg font-extrabold tabular-nums">
                  {netReturn >= 0 ? 'الصافي: ' : 'فرق على العميل: '}
                  {formatCurrency(Math.abs(netReturn))}
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
                <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(returnValue)}</p>
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-11 rounded-xl px-5">
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={saving || lines.length === 0 || refundInvalid || cashEmpty}
            className="h-11 rounded-xl bg-zinc-900 px-6 font-bold text-yellow-300 hover:bg-zinc-800 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-yellow-300 dark:text-zinc-900 dark:hover:bg-yellow-200"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : exOn && exLines.length > 0 ? (
              <ArrowLeftRight className="size-4" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {exOn && exLines.length > 0 ? 'تأكيد الاستبدال' : 'تأكيد المرتجع'}
          </Button>
        </div>
      </div>

      {/* 👕 اختيار اللون/المقاس لبضاعة الاستبدال — نفس دايلوج نقطة البيع بالظبط */}
      <POSVariantPickerDialog
        open={!!variantPick}
        onOpenChange={(o) => {
          if (!o) setVariantPick(null)
        }}
        productName={variantPick?.product.name}
        variants={variantPick?.variants ?? []}
        onPick={(v) => {
          if (!variantPick) return
          pushExLine(variantPick.product, {
            id: v.id,
            label: [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`,
            quantity: v.quantity,
          })
          setVariantPick(null)
          setExQ('')
          setExResults([])
        }}
      />
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
