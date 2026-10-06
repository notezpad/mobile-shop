'use client'

/**
 * ⚡ v9 (2026-10-06): ترقيم صفحات client-side للقوائم الضخمة
 * ─────────────────────────────────────────────────────────────────────────
 * الهدف: ما يبقاش في الـ DOM أكتر من 30-50 صف في أي وقت. الفرق الوحيد اللي
 * يحسه المستخدم إن الصفحة "أخف" — الديالوجات بتفتح أسرع لأن style recalc
 * بيشتغل على 30-50 صف بدل مئات/آلاف الصفوف.
 *
 * الإحصائيات والملخصات (إجماليات/فلاتر/تصدير Excel) بتتحسب بره الـ hook
 * على كامل البيانات زي ما هي — الترقيم هنا عرض فقط، مش فلترة.
 *
 * usePager: hook بيقص الصفوف للصفحة الحالية + يرجع للصفحة 1 لو الفلاتر اتغيرت
 * ListPager: أزرار السابق/التالي + "صفحة X من Y"
 */

import * as React from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function usePager<T>(rows: T[], pageSize: number, resetKeys: unknown[] = []) {
  const [page, setPage] = React.useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))

  // رجوع لصفحة 1 عند تغيير أي فلتر/بحث
  React.useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetKeys)

  // لو البيانات قلّت والصفحة الحالية بره النطاق → قلّص
  const safePage = Math.min(page, pageCount)

  const pageRows = React.useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  )

  return { page: safePage, pageCount, setPage, pageRows, total: rows.length }
}

export function ListPager({
  page,
  pageCount,
  setPage,
  total,
  unitLabel = 'صف',
  className,
}: {
  page: number
  pageCount: number
  setPage: (p: number) => void
  total: number
  /** اسم وحدة العد (حركة / منتج / فاتورة…) — للعرض فقط */
  unitLabel?: string
  className?: string
}) {
  if (pageCount <= 1) return null
  return (
    <nav
      dir="rtl"
      aria-label="ترقيم الصفحات"
      className={cn('flex items-center justify-center gap-1.5 py-3 text-sm', className)}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 rounded-lg px-2.5"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        <ChevronRight className="size-4" />
        السابق
      </Button>
      <span className="min-w-32 text-center text-xs text-muted-foreground">
        صفحة <b className="tabular-nums text-foreground">{page}</b> من{' '}
        <b className="tabular-nums text-foreground">{pageCount}</b>
        <span className="mx-1.5 text-border">·</span>
        <span className="tabular-nums">{total}</span> {unitLabel}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 rounded-lg px-2.5"
        disabled={page >= pageCount}
        onClick={() => setPage(page + 1)}
      >
        التالي
        <ChevronLeft className="size-4" />
      </Button>
    </nav>
  )
}
