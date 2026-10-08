'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, RefreshCw, Home,
} from 'lucide-react'
import { api } from '@/lib/api'
import { trackEvent } from '@/lib/tracking/client'
import { TRACKING_EVENTS } from '@/lib/tracking/types'

type OrderStatus = 'checking' | 'paid' | 'failed' | 'pending' | 'no_order_id'

function CheckoutCallbackContent() {
  const searchParams = useSearchParams()
  const statusParam = searchParams.get('status') as 'success' | 'failed' | null
  const merchantOrderId = searchParams.get('order')
  const reason = searchParams.get('reason')

  const [status, setStatus] = React.useState<OrderStatus>(
    statusParam === 'success' ? 'paid' :
    statusParam === 'failed' ? 'failed' :
    'checking'
  )

  // Poll for order status if we have a merchant_order_id (Paymob redirect)
  React.useEffect(() => {
    if (!merchantOrderId) {
      // Direct navigation without order id — show status param result
      return
    }
    // narrow صريح — إعلانات الدوال الـ hoisted لا تحتفظ بتضييق النوع
    const orderId: string = merchantOrderId

    let mounted = true
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      if (!mounted) return
      try {
        const result = await api<{ status: 'pending' | 'paid' | 'failed' }>(
          `/api/paymob/status?merchant_order_id=${encodeURIComponent(orderId)}`
        )
        if (!mounted) return

        if (result.status === 'paid') {
          setStatus('paid')
          return
        }
        if (result.status === 'failed') {
          setStatus('failed')
          return
        }
        // still pending — keep polling
        attempts += 1
        if (attempts < 20) {
          timer = setTimeout(poll, 3000)
        } else {
          setStatus('pending')
        }
      } catch {
        if (mounted) setStatus('failed')
      }
    }

    poll()
    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
    }
  }, [merchantOrderId])

  // ═══ 📊 Tracking Browser-side: Purchase ═══
  // يُطلق فقط بعد أن يُؤكد السيرفر نجاح الدفع فعلياً (الاشتراك active
  // في قاعدة البيانات بعد تحقق Paymob Webhook) — وليس عند فتح الصفحة
  // أو مجرد الوصول إليها.
  //
  // منع التكرار:
  //   - eventId ثابت من السيرفر (purchase-sub-<id>) = نفس معرف حدث
  //     الـ Webhook → المنصات تعمل Deduplication تلقائياً.
  //   - Refresh / إعادة فتح الصفحة → نفس eventId + حماية sessionStorage
  //     في طبقة التتبع → لا إطلاق مكرر.
  //   - فشل التتبع لا يغيّر عرض النتيجة إطلاقاً.
  React.useEffect(() => {
    if (status !== 'paid') return
    const subId = Number(searchParams.get('subscriptionId') ?? merchantOrderId?.match(/sub-(\d+)/)?.[1] ?? 0)
    if (!subId) return
    ;(async () => {
      try {
        const info = await api<{
          ok: boolean
          eventId: string
          value: number
          currency: string
          transactionId: string
          planName?: string
          planId: string
          period?: string
        }>(`/api/tracking/purchase-info?subscriptionId=${subId}`)
        if (!info?.ok) return
        trackEvent(TRACKING_EVENTS.Purchase, {
          eventId: info.eventId,
          value: info.value,
          currency: info.currency,
          transactionId: info.transactionId,
          contentName: info.planName,
          contentId: info.planId,
          planName: info.planName,
          planId: info.planId,
          period: info.period,
        })
      } catch {
        // 409 = الدفع غير مؤكد، 403 = ليس مالكاً — التتبع صامت دائماً
      }
    })()
  }, [status, searchParams, merchantOrderId])

  return (
    <div className="cb-status-wrap">
      {/* Checking spinner */}
      {status === 'checking' && (
        <>
          <div className="cb-status-icon checking">
            <Loader2 className="size-12 animate-spin" />
          </div>
          <h2 className="cb-status-title">جارٍ التحقق من الدفع...</h2>
          <p className="cb-status-msg">
            نتحقق من حالة الدفع مع بوابة Paymob. الرجاء الانتظار بضع ثوان.
          </p>
        </>
      )}

      {/* Paid — success */}
      {status === 'paid' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="cb-status-icon paid">
            <CheckCircle2 className="size-12" />
          </div>
          <h2 className="cb-status-title">تم الدفع بنجاح 🎉</h2>
          <p className="cb-status-msg">
            تم تفعيل اشتراكك بنجاح. يمكنك الآن استخدام كل مزايا الباقة.
            مبروك! 👏
          </p>
          <div className="cb-actions">
            <Link href="/" className="cb-btn cb-btn--primary">
              <Home className="size-4" />
              الذهاب للوحة التحكم
            </Link>
            <Link href="/pricing" className="cb-btn cb-btn--secondary">
              عرض الباقات
            </Link>
          </div>
        </motion.div>
      )}

      {/* Failed */}
      {status === 'failed' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="cb-status-icon failed">
            <XCircle className="size-12" />
          </div>
          <h2 className="cb-status-title">فشل الدفع</h2>
          <p className="cb-status-msg">
            {reason === 'voided' ? 'تم إلغاء العملية من قبل بوابة الدفع.'
              : reason === 'refunded' ? 'تم استرداد المبلغ من البوابة.'
              : reason === 'declined' ? 'تم رفض الدفعة من قبل البنك/المحفظة.'
              : reason === 'user_cancelled' ? 'ألغيت عملية الدفع.'
              : reason === 'verification_error' ? 'حدث خطأ أثناء التحقق من العملية.'
              : 'لم تكتمل عملية الدفع. لم يتم خصم أي مبلغ.'}
            <br />
            يمكنك المحاولة مرة أخرى في أي وقت.
          </p>
          <div className="cb-actions">
            <Link href="/pricing" className="cb-btn cb-btn--primary">
              <RefreshCw className="size-4" />
              المحاولة مرة أخرى
            </Link>
            <Link href="/" className="cb-btn cb-btn--secondary">
              <Home className="size-4" />
              العودة للوحة التحكم
            </Link>
          </div>
        </motion.div>
      )}

      {/* Pending — webhook hasn't arrived yet */}
      {status === 'pending' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="cb-status-icon pending">
            <Clock className="size-12" />
          </div>
          <h2 className="cb-status-title">الدفع قيد المعالجة</h2>
          <p className="cb-status-msg">
            وصلتنا عملية الدفع ولكن لا تزال قيد المعالجة. سيتم تفعيل اشتراكك
            خلال دقائق. لو لم يحدث ذلك خلال 10 دقائق، تواصل مع الدعم.
          </p>
          <div className="cb-actions">
            <Link href="/" className="cb-btn cb-btn--primary">
              <Home className="size-4" />
              الذهاب للوحة التحكم
            </Link>
            <Link href="/pricing" className="cb-btn cb-btn--secondary">
              عرض الباقات
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function CheckoutCallbackPage() {
  return (
    <div className="co-page landing-dark">
      <div className="co-bg-glow" aria-hidden="true" />
      <div className="co-bg-grid" aria-hidden="true" />

      <header className="co-topbar">
        <div className="co-topbar-inner">
          <Link href="/" className="co-logo">
            <div className="co-logo-icon">
              <Home className="size-4" />
            </div>
            <span>نظام المحل</span>
          </Link>
          <Link href="/pricing" className="co-back">
            <ArrowLeft className="size-4" />
            <span>العودة للأسعار</span>
          </Link>
        </div>
      </header>

      <React.Suspense
        fallback={
          <div className="cb-status-wrap">
            <div className="cb-status-icon checking">
              <Loader2 className="size-12 animate-spin" />
            </div>
            <h2 className="cb-status-title">جارٍ التحميل...</h2>
          </div>
        }
      >
        <CheckoutCallbackContent />
      </React.Suspense>
    </div>
  )
}
