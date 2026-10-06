'use client'

/**
 * صفحة الجرد (/inventory/stocktake) — محطة عدّ عملية بهوية تركواز ومرجاني.
 * وحدة المسح والعدّ + كروت التنقّل + كروت الأصناف المعدودة + أرشيف أوراق الجرد.
 */

import * as React from 'react'
import { ScanLine, FileSpreadsheet, ClipboardList, PackageCheck, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { StocktakeTab } from './StocktakeTab'
import { useInventoryData } from './useInventoryData'
import { InventoryCrossNav, InventoryStyles, STOCKTAKE_STATUS_LABELS, num } from './shared'

export function StocktakePage() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const user = useShopStore((s) => s.user)
  const userBranchId = user?.branchId ?? null

  const { branches, products, stocktakes, movements, stats, reload } = useInventoryData()

  const exportExcel = () => {
    if (stocktakes.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('عمليات-الجرد'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل عمليات الجرد',
      sheetName: 'الجرد',
      columns: [
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'الفرع', key: 'branch', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'فروقات الكمية', key: 'diffTotal', format: 'int' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'بواسطة', key: 'user', format: 'text' },
      ],
      rows: stocktakes.map((s) => ({
        date: new Date(s.createdAt).toLocaleString('ar-EG'),
        branch: s.branch?.name || 'كل الفروع',
        itemsCount: s.items.length,
        diffTotal: s.items.reduce((sum, i) => sum + i.diff, 0),
        status: STOCKTAKE_STATUS_LABELS[s.status] ?? s.status,
        user: s.createdByName || '-',
      })),
    })
  }

  return (
    <div className="space-y-5">
      <InventoryStyles />

      {/* ═════════ عنوان محطة الجرد ═════════ */}
      <section className="animate-in-up overflow-hidden rounded-2xl border border-stocktake/20 bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative flex items-center gap-4 overflow-hidden bg-stocktake px-5 py-6 text-stocktake-foreground sm:px-7">
            <div aria-hidden className="absolute inset-y-0 start-0 w-1.5 bg-stocktake-warm" />
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-stocktake-foreground/12 ring-1 ring-stocktake-foreground/20">
              <ScanLine className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold text-stocktake-foreground/70">محطة العمل</p>
              <h1 className="text-2xl font-black sm:text-3xl">جرد المخزون</h1>
              <p className="mt-1 text-sm font-medium text-stocktake-foreground/75">
                امسح الصنف، راجع العدد الفعلي، ثم اعتمد التسوية
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-stocktake/15 bg-stocktake-soft lg:min-w-[360px] lg:border-s lg:border-t-0">
            <div className="flex items-center gap-3 border-e border-stocktake/15 px-5 py-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-card text-stocktake shadow-xs">
                <ClipboardList className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-muted-foreground">أوراق الجرد</p>
                <p className="text-2xl font-black tabular-nums text-stocktake">{num(stocktakes.length)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center p-4">
              <Button variant="outline" onClick={exportExcel} disabled={stocktakes.length === 0} className="h-11 w-full border-stocktake/25 bg-card text-stocktake hover:bg-stocktake/10">
                <FileSpreadsheet className="size-4" />
                تصدير Excel
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-stocktake/15 bg-card text-xs sm:grid-cols-4">
          <div className="flex items-center gap-2 border-e border-b border-stocktake/10 px-4 py-3 sm:border-b-0">
            <PackageCheck className="size-4 text-stocktake" />
            <span className="text-muted-foreground">الأصناف</span>
            <b className="ms-auto tabular-nums">{num(stats.totalItems)}</b>
          </div>
          <div className="flex items-center gap-2 border-b border-stocktake/10 px-4 py-3 sm:border-e sm:border-b-0">
            <Scale className="size-4 text-stocktake-warm" />
            <span className="text-muted-foreground">المسودات</span>
            <b className="ms-auto tabular-nums">{num(stats.draftStocktakes)}</b>
          </div>
          <div className="hidden sm:block" />
          <div className="hidden sm:block" />
        </div>
      </section>

      {/* ═════════ كروت التنقّل بين صفحات المخزون ═════════ */}
      <InventoryCrossNav
        active="stocktake"
        counts={{
          stock: { text: `${num(stats.totalItems)} صنف` },
          movements: { text: `${num(movements.length)} حركة` },
          transfers: {
            text: stats.pendingTransfers > 0 ? `${num(stats.pendingTransfers)} معلّق` : undefined,
            alert: stats.pendingTransfers > 0,
          },
          stocktake: {
            text: stats.draftStocktakes > 0 ? `${num(stats.draftStocktakes)} مسودة` : `${num(stocktakes.length)} عملية`,
            alert: stats.draftStocktakes > 0,
          },
        }}
      />

      {/* ═════════ وحدة المسح + الكروت + الأرشيف ═════════ */}
      <StocktakeTab
        stocktakes={stocktakes}
        branches={branches}
        products={products}
        userBranchId={userBranchId}
        onChanged={reload}
      />
    </div>
  )
}
