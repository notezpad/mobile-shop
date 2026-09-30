'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// ⚡ PERF: صفحة المخزون بتجيب كل بياناتها client-side — بنعطّل SSR عشان
// ما نحرقش CPU الوقت على السيرفر (نفس أسلوب باقي صفحات النظام).
const View = dynamic(() => import('@/components/shop/inventory/StockPage').then((m) => m.StockPage), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="size-5 animate-spin text-primary" />
    </div>
  ),
})

export default function Page() {
  return <View />
}
