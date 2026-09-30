'use client'

/**
 * صفحة الجرد (/inventory/stocktake) — هوية الجرد البنفسجية.
 * وحدة المسح والعدّ (بتصميم فاتح معبّر — استبدلت النسخة السوداء القديمة)
 * + كروت التنقّل + كروت الأصناف المعدودة + أرشيف أوراق الجرد.
 */

import * as React from 'react'
import { ScanLine, FileSpreadsheet, ClipboardList } from 'lucide-react'
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

      {/* ═════════ شريط الهوية — عدّادة الجرد البنفسجية ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/[0.09] via-transparent to-fuchsia-500/[0.05]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-16 size-72 rounded-full bg-violet-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -start-10 size-64 rounded-full bg-purple-400/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4 p-5 sm:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-md shadow-violet-500/30">
            <ScanLine className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">
              الجرد <span className="text-violet-600 dark:text-violet-400">· عدّ وتسوية</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              امسح البضاعة الفعلية واعتمد الفروقات عشان الكميات تضبط
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-2 text-center">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <ClipboardList className="size-3" />
                أوراق الجرد
              </p>
              <p className="text-2xl font-black tabular-nums text-violet-700 dark:text-violet-300">
                {num(stocktakes.length)}
              </p>
            </div>
            <Button variant="outline" onClick={exportExcel} disabled={stocktakes.length === 0} className="h-10">
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
          </div>
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
