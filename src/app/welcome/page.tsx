'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { PackagePlus, MessageCircle, ArrowLeft, Link2, Copy, Chrome, Send } from 'lucide-react'
import { getMe } from '@/lib/auth-client'

/**
 * 👋 شاشة الترحيب بعد التسجيل.
 * الهدف: أول خطوة واحدة واضحة (إضافة أول منتج) بدل ما المستخدم يلاقي
 * داشبورد فاضية — ومعاها زر واتساب للدعم لو محتاج مساعدة.
 */
const WHATSAPP_NUMBER = '201010328471' // 01010328471
const WHATSAPP_TEXT = 'أهلاً، سجلت في النظام وعايز مساعدة إني أبدأ وأضيف منتجاتي'

/** 01012345678 → 201012345678 (رقم مصري للـ wa.me) */
function toWaNumber(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '')
  if (/^01\d{9}$/.test(d)) return '2' + d
  if (/^201\d{9}$/.test(d)) return d
  return null
}

export default function WelcomePage() {
  const router = useRouter()
  const [name, setName] = React.useState('')
  // 📱 متصفح فيسبوك/إنستجرام الداخلي: المستخدم بينسى الرابط ومبيرجعش
  const [inApp, setInApp] = React.useState(false)
  const [isAndroid, setIsAndroid] = React.useState(false)
  const [contact, setContact] = React.useState<{ phone: string; email: string } | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    const ua = navigator.userAgent || ''
    const forced = new URLSearchParams(window.location.search).get('iab') === '1' // للتجربة
    setInApp(forced || /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\//i.test(ua))
    setIsAndroid(/Android/i.test(ua))
    try {
      const raw = sessionStorage.getItem('welcome_contact')
      if (raw) setContact(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'
  const selfWa = toWaNumber(contact?.phone || '')
  const selfMsg = `رابط دخول نظام المحل:\n${loginUrl}${contact?.email ? `\nالإيميل: ${contact.email}` : ''}`
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* ignore */ }
  }

  React.useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        // لو مفيش سيشن (فتح الرابط من غير تسجيل) نوديه للصفحة الرئيسية
        if (!u) router.replace('/login')
        else setName((u.name || '').trim().split(/\s+/)[0] || '')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [router])

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`

  return (
    <main
      dir="rtl"
      className="grid min-h-dvh place-items-center bg-gradient-to-b from-emerald-50 via-background to-background px-4 py-8 dark:from-emerald-950/30"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">
            أهلاً بيك{name ? ` يا ${name}` : ''}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            حسابك جاهز وتجربتك المجانية شغالة. ابدأ بأول منتج وفي دقيقة تبيع بالنظام.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/products?new=1"
            className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-700 text-lg font-black text-white shadow-lg shadow-emerald-800/30 transition hover:bg-emerald-800 active:scale-[0.98]"
          >
            <PackagePlus className="size-6" />
            ضيف أول منتج
          </Link>

          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-[#128C4A] bg-white text-base font-black text-[#0B5D2E] transition hover:bg-emerald-50 active:scale-[0.98] dark:border-[#4ADE80] dark:bg-transparent dark:text-[#4ADE80]"
          >
            <MessageCircle className="size-5" />
            كلمنا واتساب نساعدك
          </a>
        </div>


        {inApp && (
          <div className="space-y-2.5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3.5 text-right dark:border-amber-700 dark:bg-amber-950/30">
            <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-amber-900 dark:text-amber-200">
              <Link2 className="size-4 shrink-0" />
              احفظ رابط دخولك عشان ترجع بعدين
            </p>
            <p className="text-[11.5px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              إنت فاتح من متصفح فيسبوك، والرابط بيضيع لما تقفله. خد لنفسك نسخة:
            </p>
            <div className="grid gap-2">
              {selfWa && (
                <a
                  href={`https://wa.me/${selfWa}?text=${encodeURIComponent(selfMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#128C4A] text-sm font-extrabold text-white active:scale-[0.98]"
                >
                  <Send className="size-4" />
                  ابعت رابط الدخول على واتساب بتاعي
                </a>
              )}
              <button
                type="button"
                onClick={copyLink}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-amber-600 bg-white text-sm font-black text-amber-950 active:scale-[0.98] dark:border-amber-500 dark:bg-transparent dark:text-amber-100"
              >
                <Copy className="size-4" />
                {copied ? 'اتنسخ ✓' : 'انسخ رابط الدخول'}
              </button>
              {isAndroid && (
                <a
                  href={`intent://${typeof window !== 'undefined' ? window.location.host : ''}/login#Intent;scheme=https;package=com.android.chrome;end`}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-amber-600 bg-white text-sm font-black text-amber-950 active:scale-[0.98] dark:border-amber-500 dark:bg-transparent dark:text-amber-100"
                >
                  <Chrome className="size-4" />
                  افتح في كروم
                </a>
              )}
            </div>
            {!isAndroid && (
              <p className="text-[11px] text-amber-900/70 dark:text-amber-200/70">
                أو من القايمة (⋯) اختار «فتح في المتصفح».
              </p>
            )}
          </div>
        )}

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
        >
          أدخل لوحة التحكم دلوقتي
          <ArrowLeft className="size-3.5" />
        </Link>
      </motion.div>
    </main>
  )
}
