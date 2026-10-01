'use client'

import * as React from 'react'
import { Eye, Keyboard, Lock, MoreVertical, Plus, RotateCcw, Settings2, ShoppingCart, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/EmptyState'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { formatCurrency } from '@/lib/format'
import { useShopStore } from '@/lib/store'
import { usePosStore } from '@/lib/pos/store'
import { holdCurrentTicket, useHeldStore } from '@/lib/pos/held'
import { selectPayable } from '@/lib/pos/totals'
import { useConfirm } from '../ConfirmDialogProvider'
import { ProductDialog } from '../ProductDialog'
import { Catalog } from './Catalog'
import { Ticket } from './Ticket'
import { LastSaleStrip } from './LastSaleStrip'
import { VariantPickerDialog } from './VariantPickerDialog'
import { HeldTicketsDialog } from './HeldTicketsDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { useApproval } from './ApprovalDialog'
import { ReceiptPreviewDialog, getPreviewPref, setPreviewPref } from './ReceiptPreviewDialog'
import { ReturnsDialog } from './ReturnsDialog'
import { ShiftDialog } from './ShiftDialog'
import { PosSettingsDialog } from './PosSettingsDialog'
import { SyncChip } from './SyncChip'
import { usePosSettings } from './hooks/usePosSettings'
import { useShift } from './hooks/useShift'
import { useProductSearch } from './hooks/useProductSearch'
import { useAddProduct } from './hooks/useAddProduct'
import { usePosCustomers } from './hooks/usePosCustomers'
import { usePosCheckout } from './hooks/usePosCheckout'
import { useSearchSubmit } from './hooks/useSearchSubmit'
import { useBarcodeWedge } from './hooks/useBarcodeWedge'
import { usePosHotkeys } from './hooks/usePosHotkeys'

/**
 * POS v2 (Phase 1 layout + Phase 2 features).
 *  ≥ lg : catalog (start) + sticky ticket (end, 24–26rem)
 *  < lg : catalog full width + fixed bottom bar → ticket in a bottom Drawer
 */
export function PosScreen() {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const search = useProductSearch()
  const { clear } = search
  const { adding, selectProduct, picker } = useAddProduct(clear)
  const submitSearch = useSearchSubmit(search, selectProduct)

  const lines = usePosStore((s) => s.lines)
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId)
  const customerName = usePosStore((s) => s.customerName)
  const { customers, selectedBalance, refresh } = usePosCustomers(selectedCustomerId, customerName)

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const focusSearch = React.useCallback(() => inputRef.current?.focus(), [])
  const onSold = React.useCallback(() => {
    refresh()
    setDrawerOpen(false)
    // Back to scanning immediately — the next customer is already at the counter.
    setTimeout(focusSearch, 50)
  }, [refresh, focusSearch])

  const { settings, role, refresh: refreshSettings } = usePosSettings()
  const shiftApi = useShift()
  const { ask: askApproval, dialog: approvalDialog } = useApproval()
  const isManager = role === 'ADMIN' || role === 'SUPER_ADMIN'
  // "Shift required" gate: only once we KNOW the shift state (avoids flashing the gate while loading).
  const gated = settings.requireShift && shiftApi.loaded && !shiftApi.shift
  const { checkout, submitting, lastSale, reprint, dismissLast, preview, closePreview } = usePosCheckout(customers, onSold, {
    askApproval,
    settings,
    role,
    guard: () => (settings.requireShift && !shiftApi.shift ? 'افتح الوردية الأول' : null),
  })
  const discount = usePosStore((s) => s.discount)
  const { total } = React.useMemo(() => selectPayable(lines, discount), [lines, discount])
  const itemCount = lines.length
  const confirm = useConfirm()

  // Held tickets live in localStorage under a tenant-scoped key → re-read once we know the tenant.
  const tenantId = useShopStore((s) => s.user?.tenantId)
  React.useEffect(() => useHeldStore.getState().rehydrate(), [tenantId])

  const [customerOpen, setCustomerOpen] = React.useState(false)
  const [discountOpen, setDiscountOpen] = React.useState(false)
  const [heldOpen, setHeldOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [shiftOpen, setShiftOpen] = React.useState(false)
  const [returnsOpen, setReturnsOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [previewOn, setPreviewOn] = React.useState(false)
  React.useEffect(() => setPreviewOn(getPreviewPref()), [])

  // Active line = the one the keyboard (+ − Delete ↑ ↓) acts on. Defaults to the last one, and jumps to it when something is added.
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const prevLen = React.useRef(lines.length)
  React.useEffect(() => {
    if (lines.length > prevLen.current) setActiveKey(null)
    prevLen.current = lines.length
  }, [lines.length])
  const activeLine = React.useCallback(() => {
    const ls = usePosStore.getState().lines
    return ls.find((l) => l.cartKey === activeKey) ?? ls[ls.length - 1] ?? null
  }, [activeKey])

  const hold = React.useCallback(() => {
    if (holdCurrentTicket()) {
      toast.success('اتعلّقت الفاتورة — تقدر ترجعلها من «معلّقة»')
      setTimeout(focusSearch, 50)
    } else toast.error('الفاتورة فاضية')
  }, [focusSearch])

  const clearTicket = React.useCallback(async () => {
    if (usePosStore.getState().lines.length === 0) return
    const ok = await confirm({ title: 'مسح الفاتورة؟', description: 'هيتم حذف كل الأصناف من السلة.', confirmText: 'مسح' })
    if (ok) {
      usePosStore.getState().reset()
      setTimeout(focusSearch, 50)
    }
  }, [confirm, focusSearch])

  useBarcodeWedge(gated ? () => {} : submitSearch)
  usePosHotkeys({
    onFocusSearch: focusSearch,
    onCustomer: () => setCustomerOpen(true),
    onDiscount: () => setDiscountOpen(true),
    onHold: hold,
    onPay: () => void checkout(),
    onShortcuts: () => setShortcutsOpen(true),
    onClearTicket: () => void clearTicket(),
    onMoveActive: (dir) => {
      const ls = usePosStore.getState().lines
      const cur = activeLine()
      if (!cur) return
      const i = ls.findIndex((l) => l.cartKey === cur.cartKey)
      setActiveKey(ls[Math.min(ls.length - 1, Math.max(0, i + dir))].cartKey)
    },
    onQtyDelta: (d) => {
      const l = activeLine()
      if (l) usePosStore.getState().setQty(l.cartKey, l.quantity + d * (l.unitFactor || 1))
    },
    onRemoveActive: () => {
      const l = activeLine()
      if (l) usePosStore.getState().removeLine(l.cartKey)
    },
    isSearchIdle: () => document.activeElement === inputRef.current && !search.query.trim(),
  })

  // Quick-add product dialog, opened from anywhere via the shop store.
  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const [productDlgOpen, setProductDlgOpen] = React.useState(false)
  const [productInitial, setProductInitial] = React.useState<Record<string, any> | null>(null)
  React.useEffect(() => {
    if (quickAdd.open) {
      setProductInitial(quickAdd.seed ? { name: quickAdd.seed, barcode: quickAdd.seed } : {})
      setProductDlgOpen(true)
      closeQuickAdd()
    }
  }, [quickAdd, closeQuickAdd])

  const ticketProps = {
    customers,
    selectedBalance,
    submitting,
    onCheckout: () => void checkout(),
    onCustomerCreated: refresh,
    customerOpen,
    onCustomerOpenChange: setCustomerOpen,
    discountOpen,
    onDiscountOpenChange: setDiscountOpen,
    activeKey: activeLine()?.cartKey ?? null,
    onActivate: setActiveKey,
    onHold: hold,
    onShowHeld: () => setHeldOpen(true),
    onClear: () => void clearTicket(),
  }

  return (
    <div className="space-y-3 pb-24 lg:pb-0">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">نقطة البيع</h1>
        <div className="flex items-center gap-1.5">
          <SyncChip />
          {(settings.requireShift || shiftApi.shift) && (
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-full px-3 text-xs" onClick={() => setShiftOpen(true)}>
              {shiftApi.shift ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              {shiftApi.shift ? 'الوردية' : 'افتح وردية'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openQuickAddProduct()}>
            <Plus className="size-4" />
            منتج جديد
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-9 text-muted-foreground" aria-label="المزيد">
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => setReturnsOpen(true)}><RotateCcw className="size-4" /> مرتجع</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShiftOpen(true)}>{shiftApi.shift ? <Lock className="size-4" /> : <Unlock className="size-4" />} {shiftApi.shift ? 'الوردية / قفل' : 'فتح وردية'}</DropdownMenuItem>
              <DropdownMenuCheckboxItem
                checked={previewOn}
                onCheckedChange={(v) => { setPreviewOn(!!v); setPreviewPref(!!v) }}
              >
                <Eye className="size-4" /> معاينة الفاتورة قبل الطباعة
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}><Keyboard className="size-4" /> اختصارات الكيبورد</DropdownMenuItem>
              {isManager && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSettingsOpen(true)}><Settings2 className="size-4" /> إعدادات نقطة البيع</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <LastSaleStrip sale={lastSale} onReprint={reprint} onDismiss={dismissLast} />

      {gated ? (
        <div className="rounded-2xl border bg-card">
          <EmptyState
            icon={<Lock />}
            title="لازم تفتح وردية قبل البيع"
            hint="اكتب رصيد الدرج وابدأ."
            action={<Button size="lg" onClick={() => setShiftOpen(true)}><Unlock className="size-4" /> فتح وردية</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          <Catalog search={search} busy={adding} inputRef={inputRef} onSelect={selectProduct} onSubmit={submitSearch} />

          {/* Desktop ticket — sticky, scrolls its own lines */}
          <div className="hidden lg:sticky lg:top-0 lg:block">
            <Ticket {...ticketProps} className="max-h-[calc(100dvh-7rem)]" />
          </div>
        </div>
      )}

      {/* Mobile bottom bar → ticket drawer */}
      <div className={`fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden ${gated ? 'hidden' : ''}`}>
        <Button
          type="button"
          variant="gradient"
          className="h-14 w-full justify-between rounded-xl px-4 text-base"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-5" />
            {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'صنف' : 'أصناف'}` : 'الفاتورة'}
          </span>
          <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
        </Button>
      </div>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>الفاتورة</DrawerTitle>
            <DrawerDescription>الأصناف والدفع</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <Ticket {...ticketProps} className="max-h-[85dvh] border-0 shadow-none" />
          </div>
        </DrawerContent>
      </Drawer>

      {approvalDialog}
      <ShiftDialog open={shiftOpen} onOpenChange={setShiftOpen} shiftApi={shiftApi} canSeeHistory={isManager} />
      <ReturnsDialog open={returnsOpen} onOpenChange={setReturnsOpen} askApproval={askApproval} />
      <PosSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSaved={refreshSettings} />
      <ReceiptPreviewDialog html={preview} onClose={closePreview} />
      <HeldTicketsDialog open={heldOpen} onOpenChange={setHeldOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <VariantPickerDialog
        open={picker.open}
        product={picker.product}
        variants={picker.variants}
        onPick={picker.pick}
        onClose={picker.close}
      />

      <ProductDialog
        open={productDlgOpen}
        onOpenChange={setProductDlgOpen}
        initial={productInitial}
        categories={[]}
        onSaved={() => {
          setProductDlgOpen(false)
          setProductInitial(null)
        }}
      />
    </div>
  )
}
