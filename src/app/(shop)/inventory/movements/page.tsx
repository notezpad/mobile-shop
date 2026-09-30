'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const View = dynamic(
  () => import('@/components/shop/inventory/MovementsPage').then((m) => m.MovementsPage),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    ),
  },
)

export default function Page() {
  return <View />
}
