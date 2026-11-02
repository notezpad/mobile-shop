'use client'

/**
 * صفحة المخزون الرئيسية (/inventory) — هوية المستودع الخضراء.
 * لوحة المستودع + رفوف الحالة + شريط الأرقام، وتحتها كروت التنقّل
 * بين صفحات المخزون وقائمة الأصناف.
 */

import * as React from 'react'
import {
  Warehouse,
  Package,
  AlertTriangle,
  PackageX,
  Hourglass,
  FileSpreadsheet,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { StockTab } from './StockTab'
import { useInventoryData } from './useInventoryData'
import type { InventoryProduct } from './types'
import { InventoryCrossNav, InventoryStyles, LoadErrorBanner, SectionBoundary, num } from './shared'

export function StockPage() {
  const user = useShopStore((s) => s.user)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const isEmployee = user?.role === 'EMPLOYEE'
  const userBranchId = user?.branchId ?? null

  const { branches, products, transfers, stocktakes, loading, noData, stats: baseStats, reload, loadErrors } = useInventoryData()

  // 🏬 تبويبات الفروع (للمدير فقط، ولما يكون فيه أكتر من فرع):
  // «المخزون كله» + تبويب لكل فرع — الاختيار بيفلتر الأرقام فوق وقائمة الأصناف.
  const [activeBranch, setActiveBranch] = React.useState<string>('all')
  const showBranchTabs = !isEmployee && branches.length > 1
  React.useEffect(() => {
    if (activeBranch !== 'all' && !branches.some((b) => String(b.id) === activeBranch)) setActiveBranch('all')
  }, [branches, activeBranch])
  const scopeId = showBranchTabs && activeBranch !== 'all' ? parseInt(activeBranch, 10) : null

  const stats = React.useMemo(() => {
    if (scopeId == null) return baseStats
    const ps = products.filter((p) => p.branchId === scopeId)
    const canSeeCost = baseStats.canSeeCost
    const totalItems = ps.length
    const lowStock = ps.filter((p) => p.quantity <= p.minQuantity).length
    const outOfStock = ps.filter((p) => p.quantity <= 0).length
    const totalValueCost = canSeeCost ? ps.reduce((a, p) => a + p.quantity * (p.cost ?? 0), 0) : null
    const totalValuePrice = ps.reduce((a, p) => a + p.quantity * p.price, 0)
    const stored = ps.filter((p) => (p.displayQty ?? p.quantity) < p.quantity)
    const warehousePieces = stored.reduce((a, p) => a + (p.quantity - (p.displayQty ?? p.quantity)), 0)
    const warehouseValue = canSeeCost
      ? stored.reduce((a, p) => a + (p.quantity - (p.displayQty ?? p.quantity)) * (p.cost ?? 0), 0)
      : null
    const pendingTransfers = transfers.filter(
      (t) => t.status === 'pending' && (t.fromBranchId === scopeId || t.toBranchId === scopeId),
    ).length
    const draftStocktakes = stocktakes.filter((x) => x.status === 'draft' && x.branchId === scopeId).length
    return {
      ...baseStats,
      totalItems, lowStock, outOfStock, totalValueCost, totalValuePrice,
      expectedProfit: totalValueCost === null ? null : totalValuePrice - totalValueCost,
      healthyCount: Math.max(0, totalItems - lowStock),
      lowOnly: Math.max(0, lowStock - outOfStock),
      pendingTransfers, draftStocktakes, pendingTotal: pendingTransfers + draftStocktakes,
      warehousePieces: Math.round(warehousePieces * 1000) / 1000,
      warehouseValue: warehouseValue === null ? null : Math.round(warehouseValue * 100) / 100,
      warehouseItems: stored.length,
    }
  }, [baseStats, scopeId, products, transfers, stocktakes])

  const [exporting, setExporting] = React.useState(false)

  // 🛡️ خ-7 (2026-11-02): التصدير بيجيب **كل** الأصناف بترقيم داخلي (مش المصفوفة
  // المحلية المقصوصة عند 100) — قبل كده الملف كان بيطلع بأول 100 كأنهم الكل.
  const exportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      type Row = InventoryProduct
      const all: Row[] = []
      let total = Infinity
      for (let page = 1; all.length < total && page <= 200; page++) {
        const res = await api<{ data: Row[]; total: number }>(
          `/api/products?limit=100&status=all&page=${page}${scopeId != null ? `&branchId=${scopeId}` : ''}`,
        )
        const list = Array.isArray(res) ? (res as unknown as Row[]) : (res?.data ?? [])
        all.push(...list)
        total = Number((res as any)?.total ?? all.length)
        if (list.length === 0) break
      }
      if (all.length === 0) return
      const branchName = (id: number | null) =>
        id ? branches.find((b) => b.id === id)?.name ?? '-' : 'كل الفروع'
      exportSimpleExcel({
        fileName: excelFileName('حالة-المخزون'),
        shop: {
          name: shopName,
          phone: shopBranding.phone || undefined,
          address: shopBranding.address || undefined,
        },
        documentTitle: 'حالة المخزون',
        sheetName: 'المخزون',
        columns: [
          { header: 'المنتج', key: 'name', format: 'text' },
          { header: 'الباركود', key: 'barcode', format: 'text' },
          { header: 'التصنيف', key: 'category', format: 'text' },
          { header: 'الفرع', key: 'branch', format: 'text' },
          { header: 'الكمية', key: 'quantity', format: 'int' },
          { header: 'الحد الأدنى', key: 'minQuantity', format: 'int' },
          // 🔒 RBAC: أعمدة التكلفة تختفي لمن لا يملك صلاحية رؤية الأرباح
          ...(stats.canSeeCost ? [{ header: 'التكلفة', key: 'cost', format: 'currency' as const }] : []),
          { header: 'سعر البيع', key: 'price', format: 'currency' },
          ...(stats.canSeeCost ? [{ header: 'قيمة المخزون (تكلفة)', key: 'stockValue', format: 'currency' as const }] : []),
        ],
        rows: all.map((p) => ({
          name: p.name,
          barcode: p.barcode || '-',
          category: p.category || '-',
          branch: branchName(p.branchId),
          quantity: p.quantity,
          minQuantity: p.minQuantity,
          cost: p.cost,
          price: p.price,
          stockValue: p.quantity * p.cost,
        })),
        totals: {
          name: 'الإجمالي',
          quantity: all.reduce((s, p) => s + p.quantity, 0),
          ...(stats.canSeeCost ? { stockValue: all.reduce((s, p) => s + p.quantity * p.cost, 0) } : {}),
        },
      })
    } catch {
      // فشل الجلب الكامل → نرجّع للتصدير المحلي كحل أخير بدل مفيش حاجة
      if (products.length > 0) {
        exportSimpleExcel({
          fileName: excelFileName('حالة-المخزون'),
          shop: { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined },
          documentTitle: 'حالة المخزون (محمّل جزئياً)',
          sheetName: 'المخزون',
          columns: [
            { header: 'المنتج', key: 'name', format: 'text' },
            { header: 'الكمية', key: 'quantity', format: 'int' },
          ],
          rows: products.map((p) => ({ name: p.name, quantity: p.quantity })),
          totals: { name: 'الإجمالي', quantity: products.reduce((s, p) => s + p.quantity, 0) },
        })
      }
    } finally {
      setExporting(false)
    }
  }

  // رفوف المستودع: ٤٠ خلية تمثّل نسب الأصناف (سليم / منخفض / نفد)
  const shelf = React.useMemo(() => {
    const CELLS = 40
    const total = stats.totalItems
    if (total === 0) return Array.from({ length: CELLS }, () => 'empty' as const)
    let out = stats.outOfStock ? Math.max(1, Math.round((stats.outOfStock / total) * CELLS)) : 0
    let low = stats.lowOnly ? Math.max(1, Math.round((stats.lowOnly / total) * CELLS)) : 0
    let ok = CELLS - out - low
    if (ok < 0) {
      low += ok
      ok = 0
      if (low < 0) {
        out += low
        low = 0
      }
    }
    return [
      ...Array.from({ length: ok }, () => 'ok' as const),
      ...Array.from({ length: low }, () => 'low' as const),
      ...Array.from({ length: out }, () => 'out' as const),
    ]
  }, [stats.totalItems, stats.outOfStock, stats.lowOnly])

  const CELL_STYLE = {
    ok: 'bg-emerald-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    low: 'bg-amber-400 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    out: 'bg-rose-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    empty: 'bg-muted',
  } as const

  const strip = [
    { icon: Package, color: '#10b981', label: 'إجمالي الأصناف', value: stats.totalItems, hint: scopeId == null ? `في ${num(branches.length)} فرع` : (branches.find((b) => b.id === scopeId)?.name ?? '') },
    { icon: AlertTriangle, color: '#f59e0b', label: 'قاربت على النفاذ', value: stats.lowOnly, hint: 'عند الحد الأدنى أو أقل' },
    { icon: PackageX, color: '#f43f5e', label: 'نفدت كميتها', value: stats.outOfStock, hint: stats.outOfStock > 0 ? 'محتاجة توريد' : 'كله متوفر' },
    { icon: Hourglass, color: '#8b5cf6', label: 'بانتظار إجراء', value: stats.pendingTotal, hint: `${num(stats.pendingTransfers)} تحويل · ${num(stats.draftStocktakes)} جرد` },
  ]

  return (
    <div className="space-y-5">
      <InventoryStyles />

      {/* ═════════ تبويبات الفروع (المدير) ═════════ */}
      {showBranchTabs && (
        <div
          role="tablist"
          aria-label="الفروع"
          className="flex gap-2 overflow-x-auto rounded-2xl border bg-card p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[
            { id: 'all', name: 'المخزون كله', count: products.length },
            ...branches.map((b) => ({
              id: String(b.id),
              name: b.active === false ? `${b.name} (معطّل)` : b.name,
              count: products.filter((p) => p.branchId === b.id).length,
            })),
          ].map((b) => {
            const active = activeBranch === b.id
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveBranch(b.id)}
                className={
                  'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all ' +
                  (active
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                {b.id === 'all' ? <Warehouse className="size-4" /> : <MapPin className="size-4" />}
                {b.name}
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[11px] tabular-nums ' +
                    (active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground')
                  }
                >
                  {num(b.count)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ═════════ لوحة المستودع — هوية المخزون الخضراء ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        {/* غسلة لونية خضراء خفيفة */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-teal-500/[0.05]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-16 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
        {/* أرضية شبكية باهتة */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(128,128,128,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.10) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 90% at 85% 0%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 90% at 85% 0%, black 0%, transparent 75%)',
          }}
        />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                <Warehouse className="size-5" />
              </span>
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">المخزون</h1>
              {isEmployee && userBranchId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {branches.find((b) => b.id === userBranchId)?.name ?? '—'}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={exporting} className="ms-auto h-9 lg:ms-2">
                <FileSpreadsheet className="size-4" />
                {exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}
              </Button>
            </div>

            <div>
              {/* 🔒 RBAC: لو التكلفة مخفية نعرض قيمة البضاعة بسعر البيع بدل التكلفة (مش سرّية) */}
              <p className="text-sm font-semibold text-muted-foreground">
                {stats.canSeeCost ? 'قيمة البضاعة بسعر التكلفة' : 'قيمة البضاعة بسعر البيع'}
              </p>
              {/* 📱 2026-10-07: [overflow-wrap:anywhere] + خط أصغر على الجوال
                  عشان المبالغ المليونية والصفرية تتفضى من غير كسر التصميم */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="min-w-0 text-4xl font-black tracking-tight tabular-nums [overflow-wrap:anywhere] min-[420px]:text-5xl sm:text-6xl">
                  {noData ? '—' : num(Math.round(stats.canSeeCost ? (stats.totalValueCost ?? 0) : stats.totalValuePrice))}
                </span>
                <span className="text-lg font-bold text-muted-foreground">جنيه</span>
              </div>
            </div>

            {/* 🔒 RBAC: «لو اتباعت كلها» و«الربح المتوقع» يكشفوا هامش الربح — الاتنين مخفيين بدون الصلاحية */}
            {stats.canSeeCost && (
              <dl className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <dt className="text-xs text-muted-foreground">لو اتباعت كلها</dt>
                  <dd className="text-[15px] font-bold tabular-nums">
                    {noData ? '—' : num(Math.round(stats.totalValuePrice))} جنيه
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">الربح المتوقع</dt>
                  <dd className="text-[15px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {noData ? '—' : `+${num(Math.round(stats.expectedProfit ?? 0))}`} جنيه
                  </dd>
                </div>
                {/* 👕 المخزن الداخلي — الفلوس النايمة في الكراتين (فاشون) */}
                {stats.warehouseItems > 0 && (
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Warehouse className="size-3" />
                      في المخزن الداخلي
                    </dt>
                    <dd className="text-[15px] font-bold tabular-nums text-violet-600 dark:text-violet-400">
                      {num(stats.warehousePieces)} قطعة · {num(Math.round(stats.warehouseValue ?? 0))} جنيه
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {/* 👕 من غير صلاحية التكلفة: بنعرض القطع بس من غير قيمة */}
            {!stats.canSeeCost && stats.warehouseItems > 0 && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Warehouse className="size-3.5" />
                في المخزن الداخلي: {num(stats.warehousePieces)} قطعة ({num(stats.warehouseItems)} صنف)
              </p>
            )}
          </div>

          {/* الأرفف */}
          <div className="w-full max-w-[22rem] lg:w-[22rem]">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>رفوف المستودع</span>
              <span className="tabular-nums">{num(stats.totalItems)} صنف</span>
            </div>
            <div className="grid grid-cols-8 gap-1.5 rounded-2xl border bg-background/70 p-2.5" dir="ltr">
              {shelf.map((k, i) => (
                <span
                  key={i}
                  className={`inv-cell aspect-square rounded-[6px] ${CELL_STYLE[k]}`}
                  style={{ animationDelay: `${i * 14}ms` }}
                />
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-emerald-500" />سليم <b className="tabular-nums">{noData ? '—' : num(stats.healthyCount)}</b></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-amber-400" />منخفض <b className="tabular-nums">{noData ? '—' : num(stats.lowOnly)}</b></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-rose-500" />نفد <b className="tabular-nums">{noData ? '—' : num(stats.outOfStock)}</b></span>
            </div>
          </div>
        </div>

        {/* شريط الأرقام — 📱 v14: على الجوال مفيش قص (النص يلف سطرين لو احتاج)
            ومن sm+ فوق رجعنا truncate زي ما هي لأن المساحة بتسمح */}
        <div className="relative grid grid-cols-2 border-t bg-muted/30 lg:grid-cols-4">
          {strip.map((it, i) => (
            <div
              key={it.label}
              className={`flex items-center gap-2.5 p-3 min-[380px]:gap-3 min-[380px]:p-3.5 sm:p-4 ${i % 2 === 1 ? 'border-s' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i >= 1 ? 'lg:border-s' : ''}`}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10"
                style={{ backgroundColor: `${it.color}1f`, color: it.color }}
              >
                <it.icon className="size-4.5 sm:size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium leading-snug text-muted-foreground sm:truncate sm:text-xs">{it.label}</p>
                <p className="text-lg font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-xl sm:leading-tight">{noData ? '—' : num(it.value)}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:truncate sm:text-[11px]">{it.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════ كروت التنقّل بين صفحات المخزون ═════════ */}
      <InventoryCrossNav
        active="stock"
        counts={{
          stock: { text: `${num(stats.totalItems)} صنف` },
          movements: { text: 'دفتر الوارد والصادر' },
          transfers: {
            text: stats.pendingTransfers > 0 ? `${num(stats.pendingTransfers)} معلّق` : undefined,
            alert: stats.pendingTransfers > 0,
          },
          stocktake: {
            text: stats.draftStocktakes > 0 ? `${num(stats.draftStocktakes)} مسودة` : undefined,
            alert: stats.draftStocktakes > 0,
          },
        }}
      />

      {/* 🛡️ v17: فشل تحميل الأصناف بيظهر صريحًا برمز السبب — مش قايمة فاضية صامتة */}
      {loadErrors.products && (
        <LoadErrorBanner
          label="تعذّر تحميل المخزون"
          message={loadErrors.products}
          onRetry={reload}
        />
      )}

      {/* 🛡️ خ-7: بانر القص — القايمة بتعرض أول 100 بس والأرقام فوق من كل الأصناف */}
      {!loading && stats.totalItems > products.length && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          الأرقام فوق محسوبة على كل الأصناف ({num(stats.totalItems)} صنف) من السيرفر —
          القايمة تحت بتعرض أول {num(products.length)} صنف للتصفّح السريع.
        </p>
      )}

      {/* ═════════ قائمة الأصناف ═════════ */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      ) : (
        <SectionBoundary label="قائمة الأصناف حصل فيها خطأ">
          <StockTab
            scopeBranch={showBranchTabs ? activeBranch : undefined}
            products={products}
            branches={branches}
            isEmployee={isEmployee}
            userBranchId={userBranchId}
            onChanged={reload}
          />
        </SectionBoundary>
      )}
    </div>
  )
}
