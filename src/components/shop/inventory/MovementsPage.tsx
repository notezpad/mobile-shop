'use client'

/**
 * صفحة الحركات (/inventory/movements) — هوية دفتر الحركة السماوية.
 * شريط هوية سماوي فيه عدّاد الحركات + خط حركة متحرك، وتحته ميزان
 * الحركة والرسم الزمني والدفتر (من MovementsTab).
 */

import * as React from 'react'
import { ArrowUpDown, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { MovementsTab } from './MovementsTab'
import { useInventoryData } from './useInventoryData'
import { InventoryCrossNav, InventoryStyles, MOVEMENT_TYPE_LABELS, num } from './shared'

export function MovementsPage() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const user = useShopStore((s) => s.user)
  const isEmployee = user?.role === 'EMPLOYEE'
  const userBranchId = user?.branchId ?? null

  const { branches, movements, stats, loading, reload } = useInventoryData()

  const exportExcel = () => {
    if (movements.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('حركات-المخزون'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل حركات المخزون',
      sheetName: 'الحركات',
      columns: [
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'المنتج', key: 'product', format: 'text' },
        { header: 'النوع', key: 'type', format: 'text' },
        { header: 'الكمية', key: 'quantity', format: 'int' },
        { header: 'الفرع', key: 'branch', format: 'text' },
        { header: 'ملاحظة', key: 'note', format: 'text' },
        { header: 'بواسطة', key: 'user', format: 'text' },
      ],
      rows: movements.map((m) => ({
        date: new Date(m.createdAt).toLocaleString('ar-EG'),
        product: m.product.name,
        type: MOVEMENT_TYPE_LABELS[m.type] ?? m.type,
        quantity: m.quantity,
        branch: m.branch?.name || '-',
        note: m.note || '-',
        user: m.userName || '-',
      })),
    })
  }

  return (
    <div className="space-y-5">
      <InventoryStyles />

      {/* ═════════ شريط الهوية — دفتر الحركة السماوي ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/[0.09] via-transparent to-cyan-500/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-16 size-72 rounded-full bg-sky-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -start-10 size-64 rounded-full bg-cyan-400/10 blur-3xl" />
        {/* خط حركة متقطع يعبر الشريط */}
        <svg aria-hidden className="inv-dash pointer-events-none absolute inset-x-0 bottom-0 h-1 w-full" preserveAspectRatio="none">
          <line x1="0" y1="2" x2="100%" y2="2" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray="8 8" opacity="0.5" />
        </svg>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4 p-5 sm:p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-md shadow-sky-500/30">
            <ArrowUpDown className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">
              الحركات <span className="text-sky-600 dark:text-sky-400">· دفتر اليومية</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              كل وارد وصادر ومبيع ومرتجع بيتسجّل هنا لحظة حدوثه
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-2 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">إجمالي الحركات</p>
              <p className="text-2xl font-black tabular-nums text-sky-700 dark:text-sky-300">
                {loading ? '—' : num(movements.length)}
              </p>
            </div>
            <Button variant="outline" onClick={exportExcel} disabled={movements.length === 0} className="h-10">
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ كروت التنقّل بين صفحات المخزون ═════════ */}
      <InventoryCrossNav
        active="movements"
        counts={{
          stock: { text: `${num(stats.totalItems)} صنف` },
          movements: { text: `${num(movements.length)} حركة` },
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

      {/* ═════════ الميزان + الفلاتر + الدفتر ═════════ */}
      <MovementsTab
        movements={movements}
        branches={branches}
        isEmployee={isEmployee}
        userBranchId={userBranchId}
        onChanged={reload}
      />
    </div>
  )
}
