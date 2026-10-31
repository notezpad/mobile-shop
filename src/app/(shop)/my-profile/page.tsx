'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// 🪪 (التحديث الرابع عشر) شاشة «ملفي» — الصفحة الشخصية للموظف — ssr:false
// زي باقي الشاشات (بتيجي ببياناتها من /api/me/profile على العميل).
const View = dynamic(() => import('@/components/shop/MyProfileView').then(m => m.MyProfileView), {
  ssr: false,
  loading: () => <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>,
})

export default function Page() {
  return <View />
}
