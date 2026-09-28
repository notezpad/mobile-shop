'use client'

import * as React from 'react'
import {
  Loader2,
  Sparkles,
  Calendar,
  CalendarDays,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface Plan {
  id: number
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  features: string[]
  businessType: string
}

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When subscription is expired, only this button label changes. */
  mode?: 'upgrade' | 'renew'
  /** Optional — preselect a specific plan id (e.g. current plan's id for "Renew") */
  preselectPlanId?: number
  /** Optional — preselect period. */
  preselectPeriod?: 'monthly' | 'yearly'
}

export function UpgradeDialog({
  open,
  onOpenChange,
  mode = 'upgrade',
  preselectPlanId,
  preselectPeriod,
}: UpgradeDialogProps) {
  const [plans, setPlans] = React.useState<Plan[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedPlanId, setSelectedPlanId] = React.useState<number | null>(null)
  const [period, setPeriod] = React.useState<'monthly' | 'yearly'>(preselectPeriod ?? 'monthly')
  const [busy, setBusy] = React.useState(false)

  // ── Load public plans ──────────────────────────────────────
  React.useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    api<{ items: Plan[] }>('/api/plans/public')
      .then((d) => {
        if (!alive) return
        const items = d?.items ?? []
        setPlans(items)
        // Preselect: passed plan id > first plan
        if (preselectPlanId) {
          const found = items.find((p) => p.id === preselectPlanId)
          if (found) setSelectedPlanId(found.id)
          else if (items.length > 0) setSelectedPlanId(items[0].id)
        } else if (items.length > 0) {
          setSelectedPlanId(items[0].id)
        }
      })
      .catch(() => {
        toast.error('فشل تحميل الباقات')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, preselectPlanId])

  // ── Initiate checkout ──────────────────────────────────────
  const startCheckout = async () => {
    if (!selectedPlanId) {
      toast.error('اختر باقة أولاً')
      return
    }
    setBusy(true)
    try {
      const res = await api<{
        ok: boolean
        checkoutUrl: string
        subscriptionId: number
        amount: number
        planName: string
      }>('/api/paymob/checkout', {
        method: 'POST',
        body: {
          planId: selectedPlanId,
          period,
          successUrl: '/upgrade?status=success',
          cancelUrl: '/upgrade?status=failed&reason=user_cancelled',
        },
      })
      if (!res?.checkoutUrl) {
        throw new Error('فشل إنشاء جلسة الدفع')
      }
      toast.success('جارٍ تحويلك لصفحة الدفع الآمنة...')
      // Open Paymob iframe in the same tab — they will redirect us back to /upgrade
      setTimeout(() => {
        window.location.href = res.checkoutUrl
      }, 500)
    } catch (e: any) {
      toast.error(e?.message || 'فشل إنشاء جلسة الدفع')
    } finally {
      setBusy(false)
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)
  const selectedPrice = selectedPlan
    ? period === 'yearly'
      ? selectedPlan.priceYearly
      : selectedPlan.priceMonthly
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-w-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" />
            {mode === 'renew' ? 'تجديد الاشتراك' : 'ترقية الاشتراك'}
          </DialogTitle>
          <DialogDescription>
            اختر الباقة والفترة المناسبتين لمحلك — الدفع الآمن عبر المحافظ الإلكترونية (Vodafone Cash, Instapay, Fawry)
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* ─── Period toggle ─────────────────────── */}
            <div className="flex gap-2 rounded-lg bg-muted/40 p-1">
              <Button
                variant={period === 'monthly' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('monthly')}
                className="flex-1 gap-1.5"
              >
                <Calendar className="size-4" />
                اشتراك شهري
              </Button>
              <Button
                variant={period === 'yearly' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('yearly')}
                className="flex-1 gap-1.5"
              >
                <CalendarDays className="size-4" />
                اشتراك سنوي
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  توفير ~17%
                </span>
              </Button>
            </div>

            {/* ─── Plans grid ─────────────────────── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => {
                const price = period === 'yearly' ? p.priceYearly : p.priceMonthly
                const isSelected = selectedPlanId === p.id
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`relative rounded-xl border p-3 text-right transition-all ${
                      isSelected
                        ? 'border-primary bg-primary-subtle shadow-md ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <CheckCircle2 className="size-4" />
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold leading-tight">{p.name}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {p.businessType === 'fashion' ? 'أزياء' : 'إلكترونيات'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-extrabold text-primary">
                        {formatCurrency(price)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        / {period === 'yearly' ? 'سنة' : 'شهر'}
                      </span>
                    </div>
                    {p.features && p.features.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                        {p.features.slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="mt-0.5 size-1 shrink-0 rounded-full bg-primary" />
                            <span className="truncate">{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ─── Summary + checkout button ─────────── */}
            {selectedPlan && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border bg-muted/30 p-4"
              >
                <div className="mb-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">المجموع المستحق</p>
                    <p className="text-2xl font-bold tabular-nums text-primary">
                      {formatCurrency(selectedPrice)}
                    </p>
                  </div>
                  <div className="text-left text-xs">
                    <p className="text-muted-foreground">المدة</p>
                    <p className="font-semibold">
                      {period === 'yearly' ? '365 يوم' : '30 يوم'}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={startCheckout}
                  disabled={busy}
                  size="lg"
                  className="w-full gap-2"
                >
                  {busy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <CreditCard className="size-5" />
                  )}
                  {busy ? 'جارٍ التحضير...' : 'الدفع الآن عبر Paymob'}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>

                <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  دفع آمن ومشفّر — لا نخزّن بيانات البطاقة / المحفظة
                </div>
              </motion.div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
