/**
 * ⚡ v9 (2026-10-06): skeletons مخصصة لكل صفحة ثقيلة
 * ─────────────────────────────────────────────────────────────────────────
 * قبل كده كان فيه loading.tsx واحد عام لكل segment المتجر — دلوقتي كل صفحة
 * رئيسية ليها loading.tsx بيستدعي الكومبوننت ده بالشكل المناسب ليها، فالتنقل
 * بيورّي شكل الصفحة المستهدفة فور الضغطة بدل شكل عام.
 * الأشكال: dashboard (كروت KPI + رسم) · table (جدول صفوف) ·
 *          cards (كروت منتجات/عملاء) · finance (هيرو + دفتر)
 */

export function PageSkeleton({ variant = 'table' }: { variant?: 'dashboard' | 'table' | 'cards' | 'finance' }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {/* عنوان الصفحة */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted/50" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/70" />
      </div>

      {variant === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-4">
                <div className="mb-3 h-4 w-20 animate-pulse rounded-md bg-muted/60" />
                <div className="h-7 w-24 animate-pulse rounded-md bg-muted/80" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-2xl border bg-card lg:col-span-2" />
            <div className="h-64 animate-pulse rounded-2xl border bg-card" />
          </div>
        </>
      )}

      {variant === 'table' && (
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center gap-3 border-b p-4">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/70" />
            <div className="h-4 flex-1 animate-pulse rounded-md bg-muted/50" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-muted/60" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted/60" />
                <div className="h-4 flex-1 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: `${i * 60}ms` }} />
                <div className="hidden h-4 w-24 animate-pulse rounded-md bg-muted/45 sm:block" />
                <div className="h-6 w-16 animate-pulse rounded-full bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'cards' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-2xl border bg-card p-3" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted/50" />
              <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted/40" />
            </div>
          ))}
        </div>
      )}

      {variant === 'finance' && (
        <>
          <div className="h-36 animate-pulse rounded-3xl border bg-card" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted/60" />
                  <div className="h-4 flex-1 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: `${i * 55}ms` }} />
                  <div className="h-4 w-20 animate-pulse rounded-md bg-muted/50" />
                </div>
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl border bg-card" />
          </div>
        </>
      )}
    </div>
  )
}
