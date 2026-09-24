'use client'

import * as React from 'react'
import {
  Ticket,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { toast } from 'sonner'

/**
 * RedeemCodeCard — Self-service subscription code redemption UI.
 *
 * 🛡️ 2026-09-21 (Subscription Codes Enhancement):
 *
 * This is the user-facing half of the activation-code system. The admin
 * generates codes from the admin panel (AdminCodesView) and sends them
 * to the customer out-of-band (WhatsApp, email, receipt). The customer
 * pastes the code here to activate/renew their subscription.
 *
 * Behavior:
 *   - The card is ALWAYS visible on the Settings page (not only when
 *     expired) — users can stack a renewal code while still active,
 *     which extends their current subscription by the code's duration.
 *   - Status pill shows current subscription state (active / expiring soon / expired)
 *   - On success: shows the new end date + a "refresh" prompt so the
 *     sidebar/cache picks up the new subscription state.
 *
 * Endpoint: POST /api/admin/redeem  body: { code: string }
 * (Yes the path says "admin" but it's actually a tenant self-service
 * endpoint — it uses getSession() not requireAuth(), so users with an
 * EXPIRED subscription can still call it. The path is kept for backward
 * compatibility with the old SubscriptionExpiredScreen.)
 */
interface RedeemResponse {
  ok: boolean
  subscription: {
    id: number
    endDate: string
    planId: number
    planName: string
    period: string
  }
}

export function RedeemCodeCard({
  onRedeemed,
}: {
  /** Called after a successful redeem so the parent can refresh subscription data. */
  onRedeemed?: () => void
}) {
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<RedeemResponse | null>(null)

  const subscription = useShopStore((s) => s.subscription)
  const isExpired = subscription.expired
  const isExpiringSoon = subscription.expiringSoon
  const daysLeft = subscription.daysLeft

  const handleRedeem = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      toast.error('أدخل كود التفعيل')
      return
    }
    if (trimmed.length < 8) {
      toast.error('الكود قصير جداً — تأكد من إدخاله بشكل صحيح')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const data = await api<RedeemResponse>('/api/admin/redeem', {
        method: 'POST',
        body: { code: trimmed },
      })
      setResult(data)
      setCode('')
      toast.success('تم تفعيل الاشتراك بنجاح 🎉')
      onRedeemed?.()
    } catch (e: any) {
      toast.error(e?.message || 'كود غير صحيح')
    } finally {
      setBusy(false)
    }
  }

  const handleRefresh = () => {
    // Hard refresh — simplest way to bust all caches (Zustand store,
    // /api/subscription 5-second cache, sub_ok cookie, etc.)
    window.location.reload()
  }

  return (
    <Card className="overflow-hidden border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Ticket className="size-4" />
          </div>
          تطبيق كود اشتراك
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          عندك كود تفعيل من الإدارة؟ أدخله هنا لتفعيل أو تجديد اشتراكك. الكود صالح للاستخدام مرة واحدة.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Status pill ─────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">حالة الاشتراك:</span>
            {isExpired ? (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                <AlertTriangle className="size-3 ml-1" />
                منتهي
              </Badge>
            ) : isExpiringSoon ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                ينتهي خلال {daysLeft} يوم
              </Badge>
            ) : daysLeft != null ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="size-3 ml-1" />
                فعّال — {daysLeft} يوم متبقي
              </Badge>
            ) : (
              <Badge variant="outline">—</Badge>
            )}
          </div>
          {subscription.planName && (
            <span className="text-xs font-medium text-muted-foreground">
              {subscription.planName}
            </span>
          )}
        </div>

        {/* ── Code input + button ─────────────────────────── */}
        <div className="space-y-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCDEFGHIJKL"
            dir="ltr"
            className="font-mono text-center text-lg tracking-[0.3em] uppercase"
            maxLength={32}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault()
                handleRedeem()
              }
            }}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground text-center">
            أدخل الكود كما هو — الأحرف الإنجليزية تُحوّل تلقائياً لأحرف كبيرة
          </p>
        </div>

        <Button
          onClick={handleRedeem}
          disabled={busy || !code.trim()}
          className="w-full gap-1.5"
          size="lg"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {busy ? 'جارٍ التفعيل...' : 'تفعيل الكود'}
        </Button>

        {/* ── Success result ──────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                    <CheckCircle2 className="size-5 text-emerald-700 dark:text-emerald-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                      تم تفعيل الاشتراك بنجاح
                    </p>
                    <div className="mt-1.5 space-y-1 text-xs text-emerald-800 dark:text-emerald-200">
                      <p>
                        الباقة: <span className="font-semibold">{result.subscription.planName}</span>
                      </p>
                      <p>
                        ينتهي في:{' '}
                        <span className="font-semibold">
                          {new Date(result.subscription.endDate).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 gap-1.5 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-100 dark:hover:bg-emerald-800"
                      onClick={handleRefresh}
                    >
                      <RotateCcw className="size-3.5" />
                      تحديث الصفحة لتفعيل الاشتراك
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Helper text ─────────────────────────────────── */}
        {isExpired && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20">
            <p className="text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                اشتراكك منتهي — الميزات متوقفة. أدخل كود تفعيل صالح لاستعادة الخدمة،
                أو تواصل مع الإدارة للحصول على كود جديد.
              </span>
            </p>
          </div>
        )}
        {!isExpired && !isExpiringSoon && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="size-3 shrink-0" />
            <span>
              تلميح: يمكنك تطبيق كود تجديد قبل انتهاء اشتراكك الحالي — سيتم إلغاء
              الاشتراك القديم وإنشاء جديد بنفس الباقة والمدة المحددة في الكود.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
