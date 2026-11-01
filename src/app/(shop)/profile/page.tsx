'use client'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// 👤 (التحديث السابع عشر) صفحة «ملفي» — نفس نمط باقي الصفحات: العرض
// client-side بس (ssr:false) لأنه بيجيب بياناته من /api/me/profile في
// useEffect — الـ SSR هنا بيتنفذ ببلاش على الـ Worker من غير أي فايدة.
const View = dynamic(() => import('@/components/shop/MyProfileView').then(m => m.MyProfileView), {
  ssr: false,
  loading: () => <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>,
})

export default function Page() {
  return <View />
}
