'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// ⚡ PERF FIX (CPU time / Error 1102): was React.lazy + Suspense, which Next.js
// still fully renders on the SERVER during SSR (React resolves the lazy import
// and streams the real markup — full CPU cost is paid on the Worker either way).
// InventoryView fetches all of its data client-side in useEffect, so server-rendering
// it did nothing except burn CPU time; ssr:false skips that entirely and lets
// the client mount it directly, cutting Worker CPU time with zero behavior change.
const View = dynamic(() => import('@/components/shop/InventoryView').then(m => m.InventoryView), {
  ssr: false,
  loading: () => <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>,
})

export default function Page() {
  return <View />
}
