'use client'

/**
 * صفحة التحويلات (/inventory/transfers) — هوية اللوجستيات الكهرمانية.
 * شريط هوية بستايل الشحن (خط تحذير لوجستي + شارة معلّق)، وتحته
 * غرفة العمليات (المسار + البوليصة) وأرشيف الشحنات (من TransfersTab).
 */

import * as React from 'react'
import { Truck, FileSpreadsheet, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { TransfersTab } from './TransfersTab'
import { useInventoryData } from './useInventoryData'
import { InventoryCrossNav, InventoryStyles, TRANSFER_STATUS_LABELS, num } from './shared'

/** خط تحذير لوجستي (نفس ستايل بوليصة الشحن) */
const HAZARD =
  'repeating-linear-gradient(-45deg, #f59e0b 0 10px, rgba(15,23,42,0.88) 10px 20px)'

export function TransfersPage() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const user = useShopStore((s) => s.user)
  const isEmployee = user?.role === 'EMPLOYEE'
  const userBranchId = user?.branchId ?? null

  const { branches, products, transfers, movements, movementMeta, stats, loading, reload } = useInventoryData()

  const exportExcel = () => {
    if (transfers.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('تحويلات-المخزون'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل التحويلات بين الفروع',
      sheetName: 'التحويلات',
      columns: [
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'من فرع', key: 'from', format: 'text' },
        { header: 'إلى فرع', key: 'to', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'إجمالي الكمية', key: 'totalQty', format: 'int' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'بواسطة', key: 'user', format: 'text' },
      ],
      rows: transfers.map((t) => ({
        date: new Date(t.createdAt).toLocaleString('ar-EG'),
        from: t.fromBranch.name,
        to: t.toBranch.name,
        itemsCount: t.items.length,
        totalQty: t.items.reduce((s, i) => s + i.quantity, 0),
        status: TRANSFER_STATUS_LABELS[t.status] ?? t.status,
        user: t.createdByName || '-',
      })),
    })
  }

  return (
    <div className="space-y-5">
      <InventoryStyles />

      {/* ═════════ شريط الهوية — مركز الشحن الكهرماني ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        {/* خط تحذير لوجستي علوي */}
        <div aria-hidden className="h-2.5 w-full" style={{ backgroundImage: HAZARD }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.09] via-transparent to-orange-500/[0.05]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-16 size-72 rounded-full bg-amber-500/15 blur-3xl" />

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4 p-5 pt-6 sm:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
            <Truck className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">
              التحويلات <span className="text-amber-600 dark:text-amber-400">· مركز الشحن</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              انقل البضاعة بين فروعك بأوراق تحويل معتمدة وقابلة للتتبع
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats.pendingTransfers > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                <Clock className="size-4 text-amber-600 dark:text-amber-400" />
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-muted-foreground">بانتظار الشحن</p>
                  <p className="text-xl font-black tabular-nums text-amber-700 dark:text-amber-300">
                    {num(stats.pendingTransfers)}
                  </p>
                </div>
              </div>
            )}
            <Button variant="outline" onClick={exportExcel} disabled={transfers.length === 0} className="h-10">
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ كروت التنقّل بين صفحات المخزون ═════════ */}
      <InventoryCrossNav
        active="transfers"
        counts={{
          stock: { text: `${num(stats.totalItems)} صنف` },
          movements: { text: `${num(movementMeta?.total ?? movements.length)} حركة` },
          transfers: {
            text: loading ? '…' : `${num(transfers.length)} تحويل`,
            alert: stats.pendingTransfers > 0,
          },
          stocktake: {
            text: stats.draftStocktakes > 0 ? `${num(stats.draftStocktakes)} مسودة` : undefined,
            alert: stats.draftStocktakes > 0,
          },
        }}
      />

      {/* ═════════ غرفة العمليات + الأرشيف ═════════ */}
      <TransfersTab
        transfers={transfers}
        branches={branches}
        products={products}
        userBranchId={userBranchId}
        onChanged={reload}
      />
    </div>
  )
}
