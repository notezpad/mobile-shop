'use client'

import { cn } from '@/lib/utils'

/**
 * بديل الباركود للصنف اللي مالوش باركود: أعمدة "شبح" باهتة بخط متقطع + تسمية،
 * بدل خانة فاضية. مشترك بين صفحة المنتجات وصفحة المخزون.
 */
const BARS = [10, 14, 8, 14, 11, 14, 7, 14, 10, 14, 9, 14, 12, 8]

/** compact: أقل ارتفاع (للجداول). */
export function NoBarcode({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 bg-muted/30 text-muted-foreground/70',
        compact ? 'py-1.5' : 'px-2 py-1.5',
        className,
      )}
      title="الصنف ده مالوش باركود"
    >
      <span aria-hidden className="flex h-4 items-end gap-[2px]">
        {BARS.map((h, i) => (
          <span key={i} className="w-[2px] shrink-0 rounded-full bg-foreground/30" style={{ height: h }} />
        ))}
      </span>
      <span className="text-[11px] font-semibold">بدون باركود</span>
    </div>
  )
}
