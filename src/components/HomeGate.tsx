'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useShopStore } from '@/lib/store'
import { api } from '@/lib/api'
import { getMe, HOME_GATE_BOOT_KEY, clearHomeGateBootCache, type AuthUser } from '@/lib/auth-client'

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
 *
 * ⚡ FAST-BOOT FIX (2026-10-08) — "كل ريفرش بتظهر الرئيسية وبعدها لوحة الأدمن":
 *   الـ HTML الأولاني بيفضل اللاندنج (عمداً — SEO)، والمستخدم المسجّل كان
 *   بيشوفها فلاش لحد ما getMe() يرجع من السيرفر ويقلب الواجهة للوحة الأدمن.
 *
 *   الحل: آخر قرار ناجح (superadmin + نسخة عرض من المستخدم) بيتخزن في
 *   sessionStorage، وبيتطبّق قبل أول paint عبر useLayoutEffect — يعني
 *   الفلاشة بتختفي تماماً، والسبينر/اللوحة بتظهر فوراً.
 *
 *   🛡️ السيرفر فضل مصدر الحقيقة: getMe() بيتنادى في الخلفية زي ما هو —
 *   لو الكاش قديم (خروج / حظر / تغيير دور) القرار بيتصحح فوراً بعد الرد.
 *   الزوار والبوتات عمرهم ما عندهم كاش → سلوك SEO زي ما هو بالظبط.
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

// ── ⚡ Fast-boot cache (sessionStorage — يعيش لحد إغلاق التاب فقط) ──
// نسخة "عرض" بس من المستخدم (اسم/إيميل/دور) — مش بيانات اعتماد؛ السيشن
// الحقيقية كوكي httpOnly على السيرفر. نفس فلسفة write-through بتاع IDB
// في auth-client لكن للسرعة الفورية بدل الأوفلاين.
interface BootCache {
  boot: 'superadmin'
  user: AuthUser
}

function readBootCache(): BootCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(HOME_GATE_BOOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BootCache> | null
    // تحقق صارم: القرار الوحيد اللي بنسرّع فيه هو "سوبر أدمن مؤكد" —
    // أي شكل تاني (فاسد/قديم/دور مختلف) → نتجاهل ونسلك المسار الطبيعي.
    if (
      parsed?.boot === 'superadmin' &&
      parsed?.user?.role === 'SUPER_ADMIN' &&
      typeof parsed?.user?.userId === 'string' &&
      parsed.user.userId
    ) {
      return parsed as BootCache
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeBootCache(user: AuthUser): void {
  try {
    window.sessionStorage.setItem(
      HOME_GATE_BOOT_KEY,
      JSON.stringify({ boot: 'superadmin', user } satisfies BootCache)
    )
  } catch {
    /* ignore — وضع التصفح الخاص/الكوتا الممتلئة مش مشكلة، بس بيفقد السرعة */
  }
}

export function HomeGate({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = React.useState<Boot>('checking')
  const setUser = useShopStore((s) => s.setUser)
  const setShopName = useShopStore((s) => s.setShopName)
  const setBranding = useShopStore((s) => s.setBranding)
  const user = useShopStore((s) => s.user)
  const router = useRouter()
  // 🛡️ العلم ده بيتفعّل لما السيرفر يأكد السيشن فعلياً. من غيره القرار
  // التفاؤلي من الكاش كان هيتمسح فوراً — لأن الـ store بيبدأ user=null
  // بعد كل ريفرش (متعمد: السيشن بتيجي طازة من الـ API مش من localStorage).
  const verifiedRef = React.useRef(false)

  // ⚡ Fast-boot قبل أول paint:
  //   أول render بيطابق الـ HTML بتاع السيرفر حرفياً (لاندنج في حالة
  //   'checking') → لا hydration mismatch → useLayoutEffect بيقلب الواجهة
  //   للمتصفح قبل ما يرسم أي فريم → السوبر أدمن ما يشوفش اللاندنج خالص.
  //   (useEffect العادي بينفذ بعد أول paint = الفلاشة بترجع تاني.)
  const useIsoLayoutEffect =
    typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect
  useIsoLayoutEffect(() => {
    const cached = readBootCache()
    if (cached) {
      setUser(cached.user) // نسخة عرض فورية — getMe هيحدّثها بالبيانات الطازة
      setBoot('superadmin')
    }
  }, [setUser])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      const meResult = await Promise.allSettled([getMe()]).then((r) => r[0])
      if (!alive) return
      const me = meResult.status === 'fulfilled' ? meResult.value : null
      // ✅ التحقق من السيرفر خلص — من هنا القرار رسمي ومسموح للـ effects
      // التانية تعتمد عليه (verifiedRef قبل أي setBoot للفوق).
      verifiedRef.current = true
      if (!me) {
        clearHomeGateBootCache()
        setUser(null) // ننضف نسخة العرض اللي جاية من الكاش لو كانت اتطبقت
        setBoot('guest')
        return
      }

      // سوبر أدمن (مش في وضع impersonation) → لوحة الأدمن على "/"
      if (me.role === 'SUPER_ADMIN' && !(me as any).impersonating) {
        setUser(me)
        writeBootCache(me) // ⚡ الريفرش الجاي هيفتح اللوحة فوراً بلا فلاش
        setBoot('superadmin')
        return
      }

      // قرار غير أدمن (مستخدم محل / impersonation / دور اتغير) → أي كاش
      // أدمن قديم لازم يتشال عشان الريفرش الجاي ما يفلاشش لوحة غلط.
      clearHomeGateBootCache()

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
  // 🛡️ verifiedRef: من غيره الكاش التفاؤلي كان بيتلغى قبل التحقق — لأن
  // الـ effect ده بيشتغل لحظة الماونت و user لسه null (الـ getMe في الطريق).
  React.useEffect(() => {
    if (!user && verifiedRef.current && (boot === 'shop' || boot === 'superadmin')) {
      clearHomeGateBootCache()
      setBoot('guest')
    }
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
  // الزائر الجديد/البوتات: بلا أي انتظار — زي ما هو.
  return <>{children}</>
}
