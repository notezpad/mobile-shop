'use client'

/**
 * ⚡ PERF FIX (2026-10-05 — بطء فتح الصفحات على الجوال)
 * ─────────────────────────────────────────────────────────────────
 * المشكلة: كل صفحة في السيستم بتتحمّل كـ dynamic() chunk منفصل مع
 * `ssr: false`، والسايدبار كان عليه `prefetch={false}`. النتيجة إن
 * الضغطة على أي صفحة كانت بتبدأ سلسلة كاملة بالتتابع:
 *
 *   1) طلب RSC payload للصفحة
 *   2) وبعده — وبعد ما يوصل الـ payload بس — تنزيل chunk الصفحة
 *      (ممكن مئات الكيلوبايت على شبكة موبايل ضعيفة)
 *   3) تنفيذ الـ JS على CPU الموبايل
 *   4) وبعده الـ View يعمل fetch للبيانات من السيرفر
 *
 * يعني 4 مراحل متسلسلة قبل ما المستخدم يشي حاجة — وده سبب رئيسي
 * في الـ 7-10 ثواني على الجوال.
 *
 * الحل هنا: خريطة تحميل مسبق (preload) لكل مسار. بنستدعيها عند
 * `onPointerDown` / `onMouseEnter` / `onFocus` على عناصر السايدبار —
 * يعني التنزيل بيبدأ لحظة ما إصبع المستخدم يلمس الزر (قبل الـ click
 * نفسه بـ 100-300ms)، ومتسلسل مع طلب الـ RSC مش بعده.
 *
 * ملاحظة أمان bundle: الخريطة دي بتستخدم `import()` ديناميكي — مفيش
 * أي view بيتحمّل eager، كل chunk لسه منفصل، وبيتتنزل بس لما يتلمس
 * الزر بتاعه (أو لما الـ Link بيعمل prefetch تلقائي للـ RSC payload).
 *
 * 📶 نحترم وضع توفير البيانات: لو Save-Data مفعّل بنحوّل على fetch
 * العادي فقط (من غير تنزيل chunks مسبق) — الـ RSC prefetch بتاع
 * Next.js بيفضل شغال لأنه خفيف جداً.
 */

const VIEW_PRELOADS: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('@/components/shop/DashboardView'),
  '/pos': () => import('@/components/shop/POSView'),
  '/products': () => import('@/components/shop/ProductsView'),
  '/sales': () => import('@/components/shop/SalesHistoryView'),
  '/maintenance': () => import('@/components/shop/MaintenanceView'),
  '/customers': () => import('@/components/shop/CustomersView'),
  '/suppliers': () => import('@/components/shop/SuppliersView'),
  '/purchases': () => import('@/components/shop/PurchaseOrdersView'),
  '/inventory': () => import('@/components/shop/inventory/StockPage'),
  '/inventory/movements': () => import('@/components/shop/inventory/MovementsPage'),
  '/inventory/transfers': () => import('@/components/shop/inventory/TransfersPage'),
  '/inventory/stocktake': () => import('@/components/shop/inventory/StocktakePage'),
  '/finance': () => import('@/components/shop/FinanceView'),
  '/expenses': () => import('@/components/shop/ExpensesView'),
  '/cash': () => import('@/components/shop/CashView'),
  '/reports': () => import('@/components/shop/ReportsView'),
  '/settings': () => import('@/components/shop/SettingsView'),
  '/users': () => import('@/components/shop/UsersView'),
  '/branches': () => import('@/components/shop/BranchesView'),
}

const preloading = new Set<string>()

export function preloadView(path: string) {
  const load = VIEW_PRELOADS[path]
  if (!load || preloading.has(path)) return
  preloading.add(path)
  load().catch(() => {
    // فشل الشبكة؟ اسمح بمحاولة تانية في لمسة جاية
    preloading.delete(path)
  })
}

/** true لو المستخدم طلب توفير البيانات — بنس bypass الـ preload التقيل */
export function shouldSkipPreload(): boolean {
  try {
    const conn = (navigator as any)?.connection
    return Boolean(conn?.saveData)
  } catch {
    return false
  }
}

/**
 * ⚡ Idle warm-up: بعد فتح التطبيق، لو الاتصال كويس (مش save-data ومش
 * شبكة بطيئة معروفة) بنحمّل chunks أشهر 3 صفحات في وقت الخمول — فأول
 * ضغطة على "نقطة البيع" أو "المنتجات" تبقى فورية تقريباً.
 *
 * ده بيتجاهل شبكات 2G/3G-slow صراحة، وبيراعي Save-Data، وعشان كده
 * مش هيحرق باقة المستخدم على شبكات ضعيفة/مقيسة.
 */
const WARMUP_PATHS = ['/dashboard', '/pos', '/products']

export function scheduleIdleWarmup(delayMs = 4000) {
  if (typeof window === 'undefined') return
  try {
    const conn = (navigator as any)?.connection
    const et = String(conn?.effectiveType ?? '4g')
    if (conn?.saveData) return
    if (['slow-2g', '2g', '3g'].includes(et)) return
  } catch { /* ignore */ }

  const run = () => WARMUP_PATHS.forEach((p) => preloadView(p))
  const id = setTimeout(() => {
    if ('requestIdleCallback' in window) {
      ;(window as any).requestIdleCallback(run, { timeout: 6000 })
    } else {
      run()
    }
  }, delayMs)
  // لو التاب راح في الخلفية قبل الـ warm-up، مؤجل التنفيذ مش مشكلة —
  // setTimeout بيستمر عادي والتحميل بيحصل مرة واحدة فقط (preloading set).
  return () => clearTimeout(id)
}
