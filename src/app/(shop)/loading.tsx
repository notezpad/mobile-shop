/**
 * ⚡ PERF FIX (2026-10-05 — بطء فتح الصفحات على الجوال):
 *
 * قبل كده مكنش فيه أي loading.tsx في التطبيق كله. مع التنقل بين الصفحات،
 * الصفحة القديمة كانت تفضل ثابتة متجمّدة على الشاشة من غير أي feedback
 * لحد ما الـ RSC payload + chunk الصفحة الجديدة يتنزلوا ويتنفذوا —
 * فعلى الجوال ده بيخلي المستخدم يفتكر إن "الضغطة مش شغالة" ويدوس تاني.
 *
 * الـ loading.tsx ده بيخلي Next.js يعرض skeleton فور الضغطة بينما
 * محتوى الصفحة الجديدة بيتحمّل في الخلفية.
 */
export default function ShopLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted/50" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/70" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4">
            <div className="mb-3 h-4 w-20 animate-pulse rounded-md bg-muted/60" />
            <div className="h-7 w-24 animate-pulse rounded-md bg-muted/80" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-4 flex-1 animate-pulse rounded-md bg-muted/50" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-muted/60" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted/60" />
              <div className="h-4 flex-1 animate-pulse rounded-md bg-muted/45" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="hidden h-4 w-24 animate-pulse rounded-md bg-muted/45 sm:block" />
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
