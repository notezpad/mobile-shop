'use client'
import * as React from 'react'
import { Loader2 } from 'lucide-react'

const View = React.lazy(() => import('@/components/shop/ProductsView').then(m => ({ default: m.ProductsView })))

export default function Page() {
  return (
    <React.Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>}>
      <View />
    </React.Suspense>
  )
}
