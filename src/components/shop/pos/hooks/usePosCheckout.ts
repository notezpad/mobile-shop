'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { printSale } from '@/lib/print-client'
import { printInvoiceHtml, type PrintableSale } from '@/lib/print'
import { printThermalReceipt, getStoredPrinterSettings } from '@/lib/thermal-printer'
import { usePosStore } from '@/lib/pos/store'
import { approvalNeeded, resolveTender, discountScale } from '@/lib/pos/pricing'
import { listTotalOfLines, selectPayable, toSaleItems } from '@/lib/pos/totals'
import type { CartLine, CustomerLite } from '@/lib/pos/types'
import type { LastSale } from '../LastSaleStrip'
import { getPreviewPref } from '../ReceiptPreviewDialog'
import type { PosSettings } from './usePosSettings'

/** What the server would return for a sale — built locally when we're offline so print/reprint work the same. */
function localSaleFromTicket(lines: CartLine[], p: { subtotal: number; discountAmount: number; total: number; paid: number }, ref: string, customerName: string, customerPhone: string) {
  const k = discountScale(p.subtotal, p.discountAmount)
  return {
    id: 0,
    invoiceNo: `محلية-${ref.slice(0, 6)}`,
    total: p.total,
    paid: p.paid,
    subtotal: p.discountAmount > 0 ? p.subtotal : null,
    discount: p.discountAmount,
    status: 'مكتملة',
    createdAt: new Date().toISOString(),
    customer: customerName.trim() ? { name: customerName.trim(), phone: customerPhone.trim() || null } : null,
    items: lines.map((l) => ({
      name: l.product.name,
      price: l.price * k, // same convention as the server: discount folded into the piece price
      quantity: l.quantity,
      unitQuantity: l.unitId ? Math.round(l.quantity / (l.unitFactor || 1)) : null,
      unitLabel: l.unitLabel,
      variant: l.variantLabel ? { color: l.variantLabel, size: null } : null,
    })),
  }
}

/**
 * Checkout: POST /api/sales → print → reset.
 * - Payload: items + discount + payments[{method,amount}] + note + clientRef (idempotency key).
 * - Offline: the request is queued by the offline layer and returns `{offline:true}` (no invoice yet) —
 *   we print a local receipt and clear the ticket; the SAME clientRef travels with the queued request,
 *   so a later replay can never create a second invoice.
 */
export interface CheckoutOpts {
  /** Ask the manager for the PIN (null = cancelled). */
  askApproval: (reason: string, error?: string) => Promise<string | null>
  settings: PosSettings
  role: string
  /** Returns a reason when selling is not allowed right now (e.g. shift required but none open). */
  guard?: () => string | null
}

export function usePosCheckout(customers: CustomerLite[], onSold: () => void, opts: CheckoutOpts) {
  const optsRef = React.useRef(opts)
  optsRef.current = opts
  const [preview, setPreview] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [lastSale, setLastSale] = React.useState<LastSale | null>(null)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const inFlight = React.useRef(false) // hard guard against double-submit (F9 held down, double tap)

  /** Invoice print + thermal print. Reused by "إعادة طباعة". */
  const printReceipt = React.useCallback(
    (sale: any) => {
      // Receipts show ORIGINAL prices + a discount row. The server stores discounted piece prices,
      // so scale back by subtotal/total (1 when there is no discount).
      const back = sale.subtotal && sale.total > 0 ? sale.subtotal / sale.total : 1
      const rows = (sale.items as any[]).map((it) => {
        // API price/quantity are PER PIECE / total pieces — convert back to per-unit for wholesale rows.
        const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
        const displayQty = hasUnit ? it.unitQuantity : it.quantity
        const displayPrice = (hasUnit ? (it.price * it.quantity) / it.unitQuantity : it.price) * back
        const unitSuffix = it.unitLabel ? ` (${displayQty} ${it.unitLabel})` : ''
        const variantSuffix = it.variant ? ` — ${[it.variant.color, it.variant.size].filter(Boolean).join(' / ')}` : ''
        return { it, name: it.name + variantSuffix + unitSuffix, price: displayPrice, quantity: displayQty }
      })

      const output = (sale: PrintableSale, shop: Parameters<typeof printSale>[1]) => {
        // Optional preview (per-device). Not used when a thermal printer prints directly.
        if (getPreviewPref() && !getStoredPrinterSettings().width) setPreview(printInvoiceHtml(sale, shop))
        else printSale(sale, shop)
      }
      output(
        {
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          total: sale.total,
          paid: sale.paid,
          status: sale.status,
          createdAt: sale.createdAt,
          subtotal: sale.subtotal ?? null,
          discount: sale.discount ?? 0,
          note: sale.note ?? null,
          items: rows.map((r) => ({ name: r.name, price: r.price, quantity: r.quantity })),
          customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
        },
        {
          name: shopName || undefined,
          phone: shopBranding.phone || undefined,
          address: shopBranding.address || undefined,
          logo: shopBranding.logoPath || undefined,
          invoicePrefix: shopBranding.invoicePrefix,
        },
      )

      // ⚡ Thermal printer — ESC/POS direct printing (if configured)
      const ts = getStoredPrinterSettings()
      if (ts.width) {
        printThermalReceipt({
          shopName: shopName || 'محل',
          shopPhone: shopBranding.phone || undefined,
          shopAddress: shopBranding.address || undefined,
          invoiceNo: sale.invoiceNo ?? String(sale.id),
          date: new Date(sale.createdAt).toLocaleString('ar-EG'),
          items: rows.map((r) => ({
            name: r.it.name + (r.it.variant ? ` ${[r.it.variant.color, r.it.variant.size].filter(Boolean).join('/')}` : ''),
            qty: r.quantity,
            price: r.price,
            total: r.price * r.quantity,
          })),
          subtotal: sale.subtotal ?? undefined,
          discount: sale.discount ?? 0,
          total: sale.total,
          paid: sale.paid,
          remaining: Math.max(0, sale.total - sale.paid),
          customerName: sale.customer?.name,
        })
      }
    },
    [shopName, shopBranding],
  )

  const checkout = React.useCallback(async () => {
    if (inFlight.current) return
    const st = usePosStore.getState()
    if (st.lines.length === 0) {
      toast.error('السلة فارغة')
      return
    }

    const payable = selectPayable(st.lines, st.discount)
    if (payable.discountError) {
      toast.error(payable.discountError)
      return
    }
    const tender = resolveTender(payable.total, {
      split: st.split,
      paidFull: st.paidFull,
      payMethod: st.payMethod,
      cashGiven: st.cashGiven,
      paidAmount: st.paidAmount,
      splitAmounts: st.splitAmounts,
    })
    if (tender.error) {
      toast.error(tender.error)
      return
    }

    let customerId = st.selectedCustomerId
    if (!customerId && st.customerName.trim()) {
      const match = customers.find((c) => c.name.trim() === st.customerName.trim())
      if (match) customerId = match.id
    }
    if (tender.credit > 0 && !customerId) {
      toast.error('البيع بالآجل لازم يكون مرتبط بعميل')
      return
    }

    const blocked = optsRef.current.guard?.()
    if (blocked) {
      toast.error(blocked)
      return
    }

    inFlight.current = true
    setSubmitting(true)
    try {
      // Manager approval: mirror the server rule up-front for a smooth flow (the server still decides).
      const { settings, role, askApproval } = optsRef.current
      const need = approvalNeeded({ role, maxPct: settings.employeeMaxDiscountPct, listTotal: listTotalOfLines(st.lines), netTotal: payable.total })
      let pin: string | null = null
      if (need.needed) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          toast.error('الخصم أعلى من المسموح للكاشير — موافقة المدير محتاجة اتصال بالإنترنت')
          return
        }
        pin = await askApproval(`الخصم الفعلي ${Math.round(need.pct * 10) / 10}% أعلى من المسموح (${settings.employeeMaxDiscountPct}%).`)
        if (!pin) return // cancelled — the ticket stays as it is
      }

      const send = (approvalPin: string | null) =>
        api<any>('/api/sales', {
          method: 'POST',
          body: {
            items: toSaleItems(st.lines),
            customerId,
            discount: payable.discountAmount > 0 ? st.discount : undefined,
            payments: tender.payments,
            note: st.note.trim() || undefined,
            clientRef: st.clientRef,
            approvalPin: approvalPin ?? undefined,
          },
        })

      let res: any
      for (let attempt = 0; ; attempt++) {
        try {
          res = await send(pin)
          break
        } catch (e: any) {
          const code = e?.body?.code as string | undefined
          if ((code === 'APPROVAL_REQUIRED' || code === 'APPROVAL_INVALID') && attempt < 3) {
            // Server wants (or rejected) a PIN → ask, then retry the SAME ticket (same clientRef, so no duplicate invoice).
            pin = await optsRef.current.askApproval(e.message, code === 'APPROVAL_INVALID' ? e.message : undefined)
            if (!pin) return
            continue
          }
          throw e // incl. APPROVAL_LOCKED / APPROVAL_NO_PIN → shown as a normal error toast
        }
      }

      const offline = !!res?.offline
      const sale = offline
        ? localSaleFromTicket(st.lines, { ...payable, paid: tender.paid }, st.clientRef, st.customerName, st.customerPhone)
        : res
      if (offline) toast.success('تم الحفظ محلياً — هتتسجل الفاتورة عند رجوع الاتصال')
      else toast.success(`تم البيع بنجاح - ${sale.invoiceNo}`)

      try {
        printReceipt(sale)
      } catch (e) {
        // The sale is already saved — a print failure must never look like a failed sale.
        console.error('[POS] print failed', e)
        toast.error('اتسجل البيع لكن الطباعة فشلت — استخدم "إعادة طباعة"')
      }
      setLastSale({ invoiceNo: String(sale.invoiceNo ?? sale.id), total: sale.total, change: tender.change, offline, raw: sale })

      usePosStore.getState().reset()
      onSold()
    } catch (e: any) {
      toast.error(e?.message || 'فشل إتمام البيع')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [customers, printReceipt, onSold])

  const reprint = React.useCallback(() => {
    if (lastSale) printReceipt(lastSale.raw)
  }, [lastSale, printReceipt])
  const dismissLast = React.useCallback(() => setLastSale(null), [])

  const closePreview = React.useCallback(() => setPreview(null), [])
  return { checkout, submitting, lastSale, reprint, dismissLast, preview, closePreview }
}
