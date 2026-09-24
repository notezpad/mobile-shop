'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { useShopStore } from '@/lib/store'

interface ResultState {
  status: 'success' | 'failed' | 'loading'
  reason?: string
  planCode?: string
  period?: string
  subscriptionId?: string
}

export default function UpgradePage() {
  const router = useRouter()
  const shopName = useShopStore((s) => s.shopName)
  const [result, setResult] = React.useState<ResultState>({ status: 'loading' })

  React.useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get('status') as 'success' | 'failed' | null
    if (status === 'success') {
      setResult({
        status: 'success',
        planCode: url.searchParams.get('plan') ?? undefined,
        period: url.searchParams.get('period') ?? undefined,
        subscriptionId: url.searchParams.get('subscriptionId') ?? undefined,
      })
    } else if (status === 'failed') {
      setResult({
        status: 'failed',
        reason: url.searchParams.get('reason') ?? undefined,
      })
    } else {
      // No status param — show generic landing
      setResult({ status: 'loading' })
    }
  }, [])

  // ── Loading state ─────────────────────────────────────────
  if (result.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="space-y-4 p-8 text-center">
            <Loader2 className="mx-auto size-12 animate-spin text-primary" />
            <h2 className="text-lg font-bold">جارٍ التحقق من نتيجة الدفع...</h2>
            <p className="text-sm text-muted-foreground">
              إذا استغرق هذا وقتاً طويلاً، يمكنك العودة للوحة التحكم والمحاولة مرة أخرى.
            </p>
            <Button onClick={() => router.push('/')} className="w-full">
              العودة للوحة التحكم
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Success ─────────────────────────────────────────
  if (result.status === 'success') {
    const periodLabel = result.period === 'yearly' ? 'سنوي' : 'شهري'
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-white p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="overflow-hidden border-emerald-200 shadow-xl">
            <div className="flex flex-col items-center gap-2 bg-emerald-600 px-6 py-10 text-white">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="flex size-16 items-center justify-center rounded-full bg-white/15"
              >
                <CheckCircle2 className="size-8" />
              </motion.div>
              <h1 className="text-xl font-bold">تم الدفع بنجاح 🎉</h1>
              <p className="text-xs opacity-90">اشتراكك مفعّل الآن</p>
            </div>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">المحل</span>
                  <span className="font-semibold">{shopName || '—'}</span>
                </div>
                {result.planCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الباقة</span>
                    <span className="font-mono text-xs">{result.planCode}</span>
                  </div>
                )}
                {result.period && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الفترة</span>
                    <span className="font-semibold">{periodLabel}</span>
                  </div>
                )}
                {result.subscriptionId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">رقم الاشتراك</span>
                    <span className="font-mono text-xs">#{result.subscriptionId}</span>
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                تم تفعيل اشتراكك ويمكنك الآن استخدام كل مزايا الباقة. مبروك! 👏
              </p>
              <Button
                onClick={() => router.push('/')}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                size="lg"
              >
                <ArrowRight className="size-4" />
                الذهاب للوحة التحكم
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  // ── Failure ─────────────────────────────────────────
  const reasonText: Record<string, string> = {
    declined: 'تم رفض الدفعة من البنك/المحفظة',
    voided: 'تم إلغاء العملية',
    refunded: 'تم استرداد المبلغ',
    pending: 'العملية معلّقة — تحقق لاحقاً',
    no_order: 'لم يتم استلام رقم الطلب',
    invalid_order: 'رقم الطلب غير صالح',
    invalid_merchant_id: 'مرجع الاشتراك غير صالح',
    no_sub: 'الاشتراك غير موجود',
    verification_error: 'حدث خطأ أثناء التحقق من العملية',
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 to-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="overflow-hidden border-rose-200 shadow-xl">
          <div className="flex flex-col items-center gap-2 bg-rose-600 px-6 py-10 text-white">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="flex size-16 items-center justify-center rounded-full bg-white/15"
            >
              <XCircle className="size-8" />
            </motion.div>
            <h1 className="text-xl font-bold">فشل الدفع</h1>
            <p className="text-xs opacity-90">
              {result.reason ? (reasonText[result.reason] ?? result.reason) : 'لم تكتمل العملية'}
            </p>
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>أسباب محتملة:</strong>
              <ul className="mt-1 list-disc pr-4 space-y-0.5">
                <li>رقم المحفظة / البطاقة غير صحيح</li>
                <li>لا يوجد رصيد كافٍ في المحفظة</li>
                <li>تم إغلاق نافذة الدفع قبل الإكمال</li>
                <li>اقترب موعد انتهاء جلسة الدفع (ساعة واحدة)</li>
              </ul>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              لم يتم خصم أي مبلغ من حسابك. يمكنك المحاولة مرة أخرى في أي وقت.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                className="flex-1"
              >
                العودة للوحة التحكم
              </Button>
              <Button
                onClick={() => router.push('/?upgrade=open')}
                className="flex-1 gap-1.5"
              >
                <Sparkles className="size-4" />
                المحاولة مرة أخرى
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
