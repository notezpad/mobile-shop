'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { getMe } from '@/lib/auth-client'

/**
 * 🛡️ SEO FIX: الصفحة الرئيسية كانت Client Component بالكامل والـ Landing
 * محمّلة بـ ssr:false — فالـ HTML اللي بيوصل لمحركات البحث كان سبينر فاضي.
 *
 * دلوقتي:
 *   - src/app/page.tsx (Server Component) بيرندر الـ Landing كاملة في الـ HTML.
 *   - الـ Landing بتتمرر هنا كـ children.
 *   - HomeGate بيعرض الـ children (الـ Landing) دايماً للزائر الجديد — من غير سبينر.
 *   - لو الزائر مسجّل دخول: بعد ما نتأكد من السيشن، بنحوّله لـ /dashboard
 *     (أو نعرض لوحة السوبر أدمن هنا لأنها بتعيش على "/").
 *
 * نفس عدد الطلبات القديم: getMe() واحد لكل زيارة، و /api/tenant للمسجّلين بس.
 */
const SuperAdminApp = dynamic(
  () => import('@/components/admin/SuperAdminApp').then((m) => m.SuperAdminApp),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    ),
  },
)

type Boot = 'checking' | 'guest' | 'shop' | 'superadmin'

export function HomeGate({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = React.useState<Boot>('checking')
  const setUser = useShopStore((s) => s.setUser)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const user = useShopStore((s) => s.user)
  const router = useRouter()

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      const meResult = await Promise.allSettled([getMe()]).then((r) => r[0])
      if (!alive) return
      const me = meResult.status === 'fulfilled' ? meResult.value : null
      if (!me) {
        setBoot('guest')
        return
      }

      // سوبر أدمن (مش في وضع impersonation) → لوحة الأدمن على "/"
      if (me.role === 'SUPER_ADMIN' && !(me as any).impersonating) {
        setUser(me)
        setBoot('superadmin')
        return
      }

      const tenantResult = await Promise.allSettled([
        api<{
          shopName?: string
          phone?: string | null
          address?: string | null
          logoPath?: string | null
          invoicePrefix?: string
        }>('/api/tenant'),
      ]).then((r) => r[0])
      if (!alive) return
      setUser(me)
      if (tenantResult.status === 'fulfilled') {
        const t = tenantResult.value
        if (t?.shopName) setShopName(t.shopName)
        setBranding({
          phone: t?.phone ?? null,
          address: t?.address ?? null,
          logoPath: t?.logoPath ?? null,
          invoicePrefix: t?.invoicePrefix || 'INV',
        })
      }
      setBoot('shop')
    })()
    return () => {
      alive = false
    }
  }, [setUser, setShopName, setBranding])

  // بعد تسجيل الخروج الـ user بيتمسح من الـ store → نرجع للـ Landing.
  React.useEffect(() => {
    if (!user && (boot === 'shop' || boot === 'superadmin')) setBoot('guest')
  }, [user, boot])

  // مستخدم محل مسجّل → /dashboard (navigation واحدة داخل effect، مش في الـ render)
  React.useEffect(() => {
    if (boot === 'shop') {
      // 🛡️ PWA (2026-10-07): أوفلاين الـ router.replace بيفشل — الـ App
      // Router بيطلب RSC payload من نفس المسار والـ SW بيستبعده عمداً
      // (حماية من خلط HTML قديم مع RSC) → الـ transition بيتعلّق/يتكسر.
      // الحل: full navigation عبر window.location — الطلب بيطلع
      // navigate-mode والـ SW يخدمه من كاش الصفحات المتخزنة.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        window.location.replace('/dashboard')
      } else {
        router.replace('/dashboard')
      }
    }
  }, [boot, router])

  if (boot === 'superadmin') return <SuperAdminApp />

  if (boot === 'shop') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  // 'checking' و 'guest' → الـ Landing (متسلّمة في الـ HTML من السيرفر)
  return <>{children}</>
}
