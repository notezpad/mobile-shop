'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// ⚡ نفس نمط باقي الصفحات: client-only (ssr:false) لتقليل CPU على الـ Worker.
const View = dynamic(() => import('@/components/shop/hr/HrAdvancesView').then((m) => m.HrAdvancesView), {
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
