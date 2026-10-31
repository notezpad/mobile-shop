'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// 💰 (التحديث الثالث عشر) شاشة عمولات البائعين — ssr:false زي باقي الشاشات
// (بتيجي ببياناتها من الـ API على العميل، مفيش لازمة لرندر سيرفر).
const View = dynamic(() => import('@/components/shop/CommissionsView').then(m => m.CommissionsView), {
  ssr: false,
  loading: () => <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>,
})

export default function Page() {
  return <View />
}
