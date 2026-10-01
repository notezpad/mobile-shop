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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel, Led, INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
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

  const statusTone = isExpired ? 'off' : isExpiringSoon ? 'warn' : daysLeft != null ? 'on' : 'idle'
  const statusText = isExpired
    ? 'منتهي'
    : isExpiringSoon
      ? `ينتهي خلال ${daysLeft} يوم`
      : daysLeft != null
        ? `فعّال — ${daysLeft} يوم متبقي`
        : '—'

  return (
    <Panel
      tag="04 / Activation"
      title="تطبيق كود اشتراك"
      hint="عندك كود تفعيل من الإدارة؟ أدخله هنا لتفعيل أو تجديد اشتراكك. الكود صالح للاستخدام مرة واحدة."
      icon={Ticket}
      className="h-full"
      bodyClassName="space-y-4"
    >
      {/* ── حالة الاشتراك ── */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Led tone={statusTone} pulse={statusTone === 'off' || statusTone === 'warn'} />
          {statusText}
        </span>
        {subscription.planName && (
          <span className="truncate text-xs font-medium text-muted-foreground">{subscription.planName}</span>
        )}
      </div>

      {/* ── خانة الكود: شكل «شريط تذكرة» ── */}
      <div className="space-y-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCDEFGHIJKL"
          dir="ltr"
          className="h-12 rounded-xl border-dashed border-foreground/30 bg-muted/50 text-center font-mono text-lg uppercase tracking-[0.3em] hover:border-foreground/50 focus-visible:border-foreground focus-visible:bg-background focus-visible:ring-foreground/10"
          maxLength={32}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) {
              e.preventDefault()
              handleRedeem()
            }
          }}
          disabled={busy}
        />
        <p className="text-center text-[11px] text-muted-foreground">
          أدخل الكود كما هو — الأحرف الإنجليزية تُحوّل تلقائياً لأحرف كبيرة
        </p>
      </div>

      <Button onClick={handleRedeem} disabled={busy || !code.trim()} className={`w-full gap-1.5 rounded-xl ${INK_BTN}`} size="lg">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {busy ? 'جارٍ التفعيل...' : 'تفعيل الكود'}
      </Button>

      {/* ── نتيجة التفعيل ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-foreground/25 bg-foreground/[0.03] p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    <Led tone="on" />
                    تم تفعيل الاشتراك بنجاح
                  </p>
                  <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    <p>
                      الباقة: <span className="font-bold text-foreground">{result.subscription.planName}</span>
                    </p>
                    <p>
                      ينتهي في:{' '}
                      <span className="font-bold text-foreground">
                        {new Date(result.subscription.endDate).toLocaleDateString('ar-EG-u-nu-latn', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className={`mt-3 gap-1.5 rounded-lg ${INK_BTN_OUTLINE}`} onClick={handleRefresh}>
                    <RotateCcw className="size-3.5" />
                    تحديث الصفحة لتفعيل الاشتراك
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── تلميحات ── */}
      {isExpired && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-xs leading-relaxed text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            اشتراكك منتهي — الميزات متوقفة. أدخل كود تفعيل صالح لاستعادة الخدمة، أو تواصل مع الإدارة للحصول على كود جديد.
          </span>
        </p>
      )}
      {!isExpired && !isExpiringSoon && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          <span>
            تلميح: يمكنك تطبيق كود تجديد قبل انتهاء اشتراكك الحالي — سيتم إلغاء الاشتراك القديم وإنشاء جديد بنفس الباقة والمدة المحددة في الكود.
          </span>
        </p>
      )}
    </Panel>
  )
}
