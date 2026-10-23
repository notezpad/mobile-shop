'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Search,
  Plus,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Phone,
  ArrowLeftRight,
} from 'lucide-react'

type TabKey = 'dashboard' | 'pos' | 'products' | 'customers'

// ════════════════════════════════════════════════════════════════════
// 🎬 الفيديو التعريفي — لما الفيديو يجهز:
//   1) حط ملف الفيديو في مجلد  public  باسم  demo-video.mp4
//   2) خلي الثابت ده كده:  const DEMO_VIDEO_URL = '/demo-video.mp4'
// وهيظهر المشغل تلقائياً مكان المعاينات (والزرار "شاهد العرض التوضيحي"
// في الهيرو بينزل على نفس القسم). لو سيبته فاضي، المعاينات بتفضل شغالة.
// ════════════════════════════════════════════════════════════════════
const DEMO_VIDEO_URL = ''

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { key: 'pos', label: 'نقطة البيع', icon: ShoppingCart },
  { key: 'products', label: 'المنتجات', icon: Package },
  { key: 'customers', label: 'العملاء', icon: Users },
]

const HIGHLIGHTS: Record<TabKey, string[]> = {
  dashboard: [
    'مؤشرات أداء لحظية للمبيعات والأرباح',
    'رسوم بيانية تفاعلية لاتجاهات البيع',
    'تنبيهات ذكية للمخزون والصيانة',
  ],
  pos: [
    'بحث سريع بالباركود أو اسم المنتج',
    'دعم عدة طرق دفع: نقدي، آجل، محافظ إلكترونية',
    'طباعة فاتورة حرارية بباركود',
  ],
  products: [
    'تصنيفات غير محدودة للمنتجات',
    'تنبيهات قبل نفاد المخزون',
    'حساب هامش الربح لكل منتج تلقائياً',
  ],
  customers: [
    'كشف حساب كامل لكل عميل',
    'تتبع الآجل والدفعات المؤجلة',
    'سجل المشتريات والصيانة لكل عميل',
  ],
}

export function ScreenshotsSection() {
  const [tab, setTab] = React.useState<TabKey>('dashboard')

  return (
    <section
      id="screenshots"
      className="landing-light relative scroll-mt-24 border-y border-[#00573f]/12 py-12 sm:py-24"
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-[#00946a]"
          >
            العرض التوضيحي
          </motion.span>
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 font-black text-[#0b2a20] sm:text-4xl lg:text-5xl"
            style={{ lineHeight: 1.25 }}
          >
            شاهد المنصة من الداخل
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-lg leading-relaxed lg-muted"
          >
            جولة سريعة جوه النظام — لوحة المعلومات، نقطة البيع، المنتجات، والعملاء
          </motion.p>
        </div>

        {/* 🎬 لو الفيديو متاح → مشغل الفيديو بدل المعاينات */}
        {DEMO_VIDEO_URL ? (
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-4xl"
          >
            <div className="video-frame">
              <video src={DEMO_VIDEO_URL} controls preload="metadata" playsInline />
            </div>
            <p className="mt-4 text-center text-sm lg-muted">
              عرض كامل لكل خطوة: من إضافة المنتج لطباعة الفاتورة ومتابعة الأرباح
            </p>
          </motion.div>
        ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
          <div className="flex justify-center">
            <TabsList className="glass-pill flex h-auto flex-wrap gap-1 rounded-xl p-1.5 [&_[data-state=active]]:bg-[#00c98b]/12 [&_[data-state=active]]:text-[#0b2a20] [&_button]:text-[#5b7a6e]">
              {TABS.map((t) => {
                const Icon = t.icon
                return (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm"
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          {/* Tab content */}
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={t.key}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                >
                  <BrowserFrame>{renderMockup(t.key)}</BrowserFrame>

                  {/* Highlights below */}
                  <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                    {HIGHLIGHTS[t.key].map((h, i) => (
                      <motion.div
                        key={h}
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.08 }}
                        className="glass-card flex items-start gap-2 rounded-lg p-3 text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#00946a]" />
                        <span className="text-[#0b2a20]/80">{h}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>
        )}
      </div>
    </section>
  )
}

/* ---------------- Browser frame wrapper ---------------- */
function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#00573f]/12 bg-card shadow-2xl shadow-[#00402c]/20">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-destructive" />
          <span className="size-3 rounded-full bg-accent2-400" />
          <span className="size-3 rounded-full bg-brand-400" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-background px-3 py-1 text-[10px] text-muted-foreground" dir="ltr">
          <span className="size-2 rounded-full bg-brand-500" />
          nezampos.com
        </div>
      </div>
      <div className="bg-background p-3 sm:p-5">{children}</div>
    </div>
  )
}

/* ---------------- Mockups for each tab ---------------- */
function renderMockup(tab: TabKey) {
  switch (tab) {
    case 'dashboard':
      return <DashboardMockup />
    case 'pos':
      return <POSMockup />
    case 'products':
      return <ProductsMockup />
    case 'customers':
      return <CustomersMockup />
  }
}

function DashboardMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">أهلاً، أحمد 👋</p>
          <p className="text-base font-bold">محل الاتصالات</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-success-subtle px-2 py-1 text-xs font-medium text-success-subtle-foreground">
          <TrendingUp className="size-3.5" />
          +12.5% هذا الشهر
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MockStat icon={<DollarSign className="size-4" />} label="مبيعات اليوم" value="5,420 " tone="emerald" />
        <MockStat icon={<ShoppingCart className="size-4" />} label="الفواتير" value="38" tone="primary" />
        <MockStat icon={<Package className="size-4" />} label="المنتجات" value="247" tone="amber" />
        <MockStat icon={<AlertTriangle className="size-4" />} label="تنبيهات" value="3" tone="rose" />
      </div>

      <div className="rounded-lg border p-3">
        <p className="mb-2 text-xs font-semibold">مبيعات آخر 7 أيام</p>
        <div className="flex h-28 items-end justify-between gap-1.5">
          {[45, 62, 50, 78, 65, 95, 88].map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary"
              style={{ height: `${v}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function POSMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Products list */}
      <div className="space-y-2 lg:col-span-2">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          <Search className="size-3.5" />
          ابحث بالاسم أو الباركود...
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { n: 'شاحن سريع', p: '250' },
            { n: 'كفر آيفون', p: '180' },
            { n: 'سماعة بلوتوث', p: '650' },
            { n: 'كابل USB-C', p: '90' },
            { n: 'باور بانك', p: '420' },
            { n: 'سكرين بروتكشن', p: '60' },
          ].map((p, i) => (
            <div key={i} className="rounded-lg border bg-card p-2 text-center">
              <div className="mb-1 size-12 mx-auto rounded bg-gradient-to-br from-muted to-muted/60" />
              <p className="truncate text-[11px] font-medium">{p.n}</p>
              <p className="text-[11px] font-bold text-success-subtle-foreground">{p.p} </p>
            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="rounded-lg border bg-card">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
          الفاتورة #1024
        </div>
        <div className="space-y-1.5 p-2.5">
          {[
            { n: 'شاحن سريع', q: 2, p: '500' },
            { n: 'كفر آيفون', q: 1, p: '180' },
            { n: 'سماعة بلوتوث', q: 1, p: '650' },
          ].map((r, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="truncate">{r.n} ×{r.q}</span>
              <span className="font-semibold">{r.p} </span>
            </div>
          ))}
        </div>
        <div className="border-t bg-muted/30 p-2.5">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>الإجمالي</span>
            <span className="text-success-subtle-foreground">1,330 </span>
          </div>
          <button className="mt-2 w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground">
            إتمام البيع
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductsMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          <Search className="size-3.5" />
          ابحث عن منتج...
        </div>
        <button className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
          <Plus className="size-3.5" />
          منتج جديد
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-12 bg-muted/60 px-3 py-2 text-[10px] font-semibold text-muted-foreground sm:text-xs">
          <span className="col-span-5">المنتج</span>
          <span className="col-span-2 text-center">المخزون</span>
          <span className="col-span-2 text-center">التكلفة</span>
          <span className="col-span-2 text-center">السعر</span>
          <span className="col-span-1 text-left">الربح</span>
        </div>
        {[
          { n: 'شاحن سريع 20W', c: 'موبايل', s: 12, co: 180, p: 250 },
          { n: 'كفر آيفون 15', c: 'إكسسوارات', s: 8, co: 100, p: 180 },
          { n: 'سماعة بلوتوث', c: 'صوتيات', s: 5, co: 450, p: 650 },
          { n: 'كابل USB-C', c: 'إكسسوارات', s: 2, co: 50, p: 90 },
          { n: 'باور بانك 10000', c: 'شواحن', s: 0, co: 300, p: 420 },
        ].map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-12 border-t px-3 py-2.5 text-[11px] sm:text-xs"
          >
            <div className="col-span-5">
              <p className="font-medium text-foreground">{r.n}</p>
              <p className="text-[10px] text-muted-foreground">{r.c}</p>
            </div>
            <span
              className={
                'col-span-2 text-center font-semibold ' +
                (r.s === 0
                  ? 'text-destructive-subtle-foreground'
                  : r.s <= 2
                    ? 'text-warning-subtle-foreground'
                    : 'text-foreground')
              }
            >
              {r.s === 0 ? 'نفد' : r.s}
            </span>
            <span className="col-span-2 text-center text-muted-foreground">
              {r.co} 
            </span>
            <span className="col-span-2 text-center font-semibold text-foreground">
              {r.p} 
            </span>
            <span className="col-span-1 text-left font-semibold text-success-subtle-foreground">
              {r.p - r.co}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CustomersMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Customer list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">العملاء</p>
        {[
          { n: 'محمد أحمد', p: '01012345678', b: 0, t: '2,450' },
          { n: 'سارة محمود', p: '01098765432', b: 350, t: '1,200' },
          { n: 'خالد علي', p: '01155667788', b: 0, t: '4,800' },
          { n: 'فاطمة حسن', p: '01233445566', b: -150, t: '950' },
        ].map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border bg-card p-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-xs font-bold text-primary-foreground">
                {c.n.charAt(0)}
              </span>
              <div>
                <p className="text-xs font-medium">{c.n}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground" dir="ltr">
                  <Phone className="size-2.5" />
                  {c.p}
                </p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground">الرصيد</p>
              <p
                className={
                  'text-xs font-bold ' +
                  (c.b > 0
                    ? 'text-warning-subtle-foreground'
                    : c.b < 0
                      ? 'text-success-subtle-foreground'
                      : 'text-foreground')
                }
              >
                {c.b === 0 ? '0' : c.b > 0 ? `-${c.b}` : `+${Math.abs(c.b)}`} 
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Customer detail */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2.5 border-b pb-2.5">
          <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-bold text-primary-foreground">
            م
          </span>
          <div>
            <p className="text-sm font-bold">محمد أحمد</p>
            <p className="text-[10px] text-muted-foreground" dir="ltr">01012345678</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 py-3">
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">إجمالي المشتريات</p>
            <p className="text-sm font-bold text-foreground">2,450 </p>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">الرصيد الحالي</p>
            <p className="text-sm font-bold text-success-subtle-foreground">0 </p>
          </div>
        </div>

        <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">آخر المعاملات</p>
        <div className="space-y-1.5">
          {[
            { t: 'فاتورة #1024', a: '-450', d: 'اليوم' },
            { t: 'دفعة نقدية', a: '+200', d: 'أمس' },
            { t: 'فاتورة #1018', a: '-320', d: 'من 3 أيام' },
          ].map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border bg-background px-2.5 py-1.5 text-[11px]"
            >
              <div className="flex items-center gap-1.5">
                <ArrowLeftRight className="size-3 text-muted-foreground" />
                <span>{r.t}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{r.d}</span>
                <span
                  className={
                    'font-bold ' + (r.a.startsWith('-') ? 'text-foreground' : 'text-success-subtle-foreground')
                  }
                >
                  {r.a} 
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MockStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'emerald' | 'primary' | 'amber' | 'rose'
}) {
  const toneMap = {
    emerald: 'bg-success-subtle text-success-subtle-foreground',
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-warning-subtle text-warning-subtle-foreground',
    rose: 'bg-destructive-subtle text-destructive-subtle-foreground',
  }
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className={'mb-1.5 flex size-7 items-center justify-center rounded ' + toneMap[tone]}>
        {icon}
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
