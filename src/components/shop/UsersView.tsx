'use client'

/**
 * UsersView — «بطاقات الدخول» (2026)
 *
 * هوية الصفحة: كل مستخدم = بطاقة دخول (badge) معلّقة بشريط.
 *  - لون الشريط العلوي = مستوى الصلاحية (بنفسجي للمدير، رمادي فولاذي للموظف)
 *  - النقطة على الصورة = آخر مرة دخل فيها (مش «أونلاين» — هي تاريخ آخر تسجيل دخول)
 *  - الحساب الموقوف بيتختم «موقوف» وبيبهت
 * الهيرو بيجاوب على سؤال أمان واحد: «مين عنده صلاحية دخول دلوقتي؟»
 *
 * نفس بنية الصفحات التانية: rounded-3xl + tokens (bg-card / border / muted)
 * + dark mode + RTL (start/end) — من غير ما يشبه أي واحدة فيهم.
 * المنطق (API / refresh / PDF) زي ما هو بدون أي تغيير.
 */

import * as React from 'react'
import {
  AlertTriangle,
  Check,
  Clock,
  Eye,
  EyeOff,
  Info,
  FileText,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  User,
  UserCog,
  UserX,
  Users,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatArabicDate, formatArabicDateTime } from '@/lib/format'
import { printListReportHtml, openPrintWindow } from '@/lib/print'
import { useShopStore } from '@/lib/store'
import { useDataRefresh } from '@/lib/offline/data-events'
import { useConfirm } from './ConfirmDialogProvider'
import { ALL_MODULES } from '@/lib/plan-constants'

/* ───────────────────────── الأنواع والمساعدات ───────────────────────── */

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
  lastLoginAt?: string | null
  branchId?: number | null
  branch?: { name: string } | null
  permissions?: string | null
  canViewProfits?: boolean
}

type RoleFilter = 'all' | 'ADMIN' | 'EMPLOYEE'
type StatusFilter = 'all' | 'active' | 'off'
type ViewMode = 'badges' | 'list'
type Presence = 'today' | 'recent' | 'stale' | 'never'

const DAY = 86_400_000

const num = (n: number) => n.toLocaleString('en-US')

const isAdminRole = (r: string) => r === 'ADMIN' || r === 'SUPER_ADMIN'

// ألوان صور المستخدمين — ثابتة لكل اسم
const AVATAR_GRADS: [string, string][] = [
  ['#8b5cf6', '#d946ef'],
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#0d9488'],
  ['#f59e0b', '#ef4444'],
  ['#ec4899', '#f43f5e'],
  ['#14b8a6', '#0ea5e9'],
  ['#f97316', '#eab308'],
  ['#6366f1', '#8b5cf6'],
]
function gradOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [a, b] = AVATAR_GRADS[h % AVATAR_GRADS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

const PRESENCE_LABEL: Record<Presence, string> = {
  today: 'دخل آخر 24 ساعة',
  recent: 'دخل خلال 30 يوم',
  stale: 'آخر دخول أقدم من 30 يوم',
  never: 'لسه ما دخلش',
}

function presenceOf(u: UserRow, now: number): Presence {
  if (!u.lastLoginAt) return 'never'
  const diff = now - new Date(u.lastLoginAt).getTime()
  if (diff < DAY) return 'today'
  if (diff < 30 * DAY) return 'recent'
  return 'stale'
}

const PRESENCE_DOT: Record<Presence, string> = {
  today: 'bg-emerald-500',
  recent: 'bg-amber-400',
  stale: 'bg-rose-400',
  never: 'border-2 border-muted-foreground/50 bg-card',
}

// جمع عربي بسيط: [مفرد, مثنى, جمع 3-10, تمييز 11+]
function plural(n: number, f: [string, string, string, string]) {
  if (n === 1) return f[0]
  if (n === 2) return f[1]
  if (n >= 3 && n <= 10) return `${n} ${f[2]}`
  return `${n} ${f[3]}`
}

function ago(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'دلوقتي'
  if (m < 60) return `من ${plural(m, ['دقيقة', 'دقيقتين', 'دقايق', 'دقيقة'])}`
  const h = Math.floor(m / 60)
  if (h < 24) return `من ${plural(h, ['ساعة', 'ساعتين', 'ساعات', 'ساعة'])}`
  const d = Math.floor(h / 24)
  if (d < 30) return `من ${plural(d, ['يوم', 'يومين', 'أيام', 'يوم'])}`
  const mo = Math.floor(d / 30)
  return `من ${plural(mo, ['شهر', 'شهرين', 'شهور', 'شهر'])}`
}

function strengthOf(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' }
  let s = 0
  if (pw.length >= 6) s++
  if (pw.length >= 10) s++
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++
  return { score: s, label: ['ضعيفة', 'مقبولة', 'جيدة', 'قوية'][Math.max(0, s - 1)] }
}

function genPassword(len = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

/* ───────────────────────── الصفحة ───────────────────────── */

export function UsersView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const confirm = useConfirm()

  const [users, setUsers] = React.useState<UserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserRow | null>(null)

  const [q, setQ] = React.useState('')
  const [role, setRole] = React.useState<RoleFilter>('all')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [branch, setBranch] = React.useState<string>('all')
  const [view, setView] = React.useState<ViewMode>('badges')
  const [now, setNow] = React.useState(() => Date.now())

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<UserRow[]>('/api/users')
      setUsers(data)
      setNow(Date.now())
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ live refresh — see data-events.ts
  useDataRefresh(['users'], load)

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (u: UserRow) => {
    setEditing(u)
    setDialogOpen(true)
  }

  const toggleActive = async (u: UserRow) => {
    if (u.active) {
      const ok = await confirm({
        title: `إيقاف حساب "${u.name}"؟`,
        description: 'مش هيقدر يسجّل دخول لحد ما ترجّع تفعّله تاني.',
        confirmText: 'إيقاف الحساب',
      })
      if (!ok) return
    }
    try {
      await api(`/api/users/${u.id}`, { method: 'PUT', body: { active: !u.active } })
      toast.success(u.active ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  /* ───── إحصائيات الهيرو ───── */
  const stats = React.useMemo(() => {
    const act = users.filter((u) => u.active)
    const adminsOn = act.filter((u) => isAdminRole(u.role)).length
    const staffOn = act.length - adminsOn
    const off = users.length - act.length
    const today = act.filter((u) => presenceOf(u, now) === 'today').length
    const stale = act.filter((u) => presenceOf(u, now) === 'stale').length
    const never = act.filter((u) => presenceOf(u, now) === 'never').length
    return { total: users.length, adminsOn, staffOn, off, today, stale, never }
  }, [users, now])

  const branchOptions = React.useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => {
      if (u.branchId != null && u.branch?.name) m.set(String(u.branchId), u.branch.name)
    })
    return Array.from(m, ([id, name]) => ({ id, name }))
  }, [users])

  // الأدوات (بحث/فلاتر/عرض) بتظهر بس لما الفريق يكبر
  const showTools = users.length >= 6

  const filtered = React.useMemo(() => {
    if (users.length < 6) return users
    const t = q.trim().toLowerCase()
    return users.filter((u) => {
      if (role === 'ADMIN' && !isAdminRole(u.role)) return false
      if (role === 'EMPLOYEE' && isAdminRole(u.role)) return false
      if (status === 'active' && !u.active) return false
      if (status === 'off' && u.active) return false
      if (branch === 'none' && u.branchId != null) return false
      if (branch !== 'all' && branch !== 'none' && String(u.branchId) !== branch) return false
      if (t && !(u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t))) return false
      return true
    })
  }, [users, q, role, status, branch])

  const hasFilter = q !== '' || role !== 'all' || status !== 'all' || branch !== 'all'
  const clearFilters = () => {
    setQ('')
    setRole('all')
    setStatus('all')
    setBranch('all')
  }

  const exportPdf = () => {
    const html = printListReportHtml(
      {
        title: 'المستخدمين',
        subtitle: 'إدارة حسابات المدراء والموظفين',
        columns: [
          { header: '#' },
          { header: 'الاسم', align: 'right' },
          { header: 'البريد الإلكتروني' },
          { header: 'الدور' },
          { header: 'الحالة' },
          { header: 'الفرع' },
          { header: 'تاريخ الإنشاء' },
          { header: 'آخر دخول' },
        ],
        rows: users.map((u, i) => [
          String(i + 1),
          u.name,
          u.email,
          isAdminRole(u.role) ? 'المدير' : 'الموظف',
          u.active ? 'نشط' : 'موقوف',
          u.branch?.name ?? 'كل الفروع',
          // 🛡️ FIX (tsc): تصدير Excel يستقبل نصوص فقط — كان JSX Element
          // (يتحوّل [object Object] في الملف) فبناخد النص مباشرة.
          formatArabicDateTime(u.createdAt),
          u.lastLoginAt ? formatArabicDateTime(u.lastLoginAt) : 'لم يسجل دخول بعد',
        ]),
        kpis: [
          { label: 'إجمالي المستخدمين', value: String(users.length) },
          { label: 'المدراء', value: String(users.filter((u) => isAdminRole(u.role)).length) },
          { label: 'الحسابات النشطة', value: String(users.filter((u) => u.active).length), emphasize: true },
        ],
        emptyMessage: 'لا يوجد مستخدمين',
      },
      {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
        logo: shopBranding.logoPath || undefined,
      }
    )
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  const noData = loading && users.length === 0

  return (
    <div className="space-y-5">
      {/* حركة واحدة بس: البطاقات بتتدلّى من الشريط أول ما الصفحة تفتح */}
      <style>{`
        @keyframes ub-hang {
          0%   { opacity: 0; transform: perspective(800px) rotateX(-65deg) translateY(-10px); }
          60%  { opacity: 1; transform: perspective(800px) rotateX(7deg); }
          100% { opacity: 1; transform: perspective(800px) rotateX(0); }
        }
        .ub-card { transform-origin: 50% 0; animation: ub-hang .55s cubic-bezier(.2,.8,.2,1) both; }
        .ub-off .ub-avatar { filter: grayscale(1); }
        @media (prefers-reduced-motion: reduce) { .ub-card { animation: none; } }
      `}</style>

      {/* ═════════ الهيرو — «من عنده صلاحية دخول؟» (صف واحد مضغوط) ═════════ */}
      <section className="relative overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm">
        {/* شريط التعليق: خط مستقيم أعلى الكارت */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-fuchsia-500 via-violet-600 to-violet-500" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-0 size-64 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-400/10"
        />

        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5 p-5 pt-6 sm:px-6">
          {/* الهوية + الرقم */}
          <div className="min-w-[230px]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/25">
                <UserCog className="size-[18px]" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold leading-tight">المستخدمين</h1>
                <p className="text-[11px] text-muted-foreground">حسابات الدخول وصلاحياتها</p>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="bg-gradient-to-l from-violet-600 to-fuchsia-500 bg-clip-text text-5xl font-extrabold leading-none tracking-tight tabular-nums text-transparent dark:from-violet-300 dark:to-fuchsia-300">
                {noData ? '—' : num(stats.adminsOn + stats.staffOn)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">حساب يقدر يدخل دلوقتي</span>
            </div>
          </div>

          {/* التوزيع + التنبيهات */}
          <div className="min-w-[280px] flex-1">
            {!noData && users.length > 0 && (
              <>
                <div
                  className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label="توزيع الحسابات حسب الصلاحية والحالة"
                >
                  {stats.adminsOn > 0 && (
                    <span style={{ flexGrow: stats.adminsOn }} className="bg-gradient-to-l from-violet-600 to-fuchsia-500" />
                  )}
                  {stats.staffOn > 0 && (
                    <span style={{ flexGrow: stats.staffOn }} className="bg-slate-500 dark:bg-slate-400" />
                  )}
                  {stats.off > 0 && (
                    <span
                      style={{
                        flexGrow: stats.off,
                        backgroundImage:
                          'repeating-linear-gradient(-45deg, rgba(244,63,94,.7) 0 4px, transparent 4px 8px)',
                      }}
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                  <Legend swatch="bg-gradient-to-l from-violet-600 to-fuchsia-500" label="مدراء" value={stats.adminsOn} />
                  <Legend swatch="bg-slate-500 dark:bg-slate-400" label="موظفين" value={stats.staffOn} />
                  {stats.off > 0 && <Legend swatch="bg-rose-400/70" label="موقوفين" value={stats.off} />}
                </div>

                {/* تنبيهات الأمان: شريحة واحدة لو كله سليم */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {stats.stale === 0 && stats.never === 0 ? (
                    <Chip tone="emerald" icon={ShieldCheck}>
                      {stats.today > 0
                        ? `كله متابَع — ${num(stats.today)} دخلوا آخر 24 ساعة`
                        : 'كله متابَع — مفيش حساب خامل'}
                    </Chip>
                  ) : (
                    <>
                      {stats.stale > 0 && (
                        <Chip tone="rose" icon={UserX}>
                          {num(stats.stale)} ما دخلوش من +30 يوم
                        </Chip>
                      )}
                      {stats.never > 0 && (
                        <Chip tone="amber" icon={KeyRound}>
                          {num(stats.never)} لسه ما دخلوش أبداً
                        </Chip>
                      )}
                      {stats.today > 0 && (
                        <Chip tone="emerald" icon={Clock}>
                          {num(stats.today)} دخلوا آخر 24 ساعة
                        </Chip>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* الإجراءات */}
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-col lg:items-stretch">
            <Button
              size="lg"
              onClick={openAdd}
              className="bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm hover:from-violet-500 hover:to-fuchsia-400 hover:shadow-md hover:shadow-violet-500/30"
            >
              <Plus className="size-4" />
              مستخدم جديد
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={loading || users.length === 0}>
              <FileText className="size-4" />
              تصدير PDF
            </Button>
          </div>
        </div>
      </section>

      {/* ═════════ شريط الفلاتر ═════════ */}
      {showTools && (
      <div className="space-y-3 rounded-2xl border bg-card p-3.5 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الإيميل…"
              className="h-10 rounded-xl pr-10 pl-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="مسح البحث"
                className="absolute top-1/2 left-2.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Seg
            value={role}
            onChange={(v) => setRole(v as RoleFilter)}
            options={[
              { v: 'all', l: 'الكل' },
              { v: 'ADMIN', l: 'مدراء' },
              { v: 'EMPLOYEE', l: 'موظفين' },
            ]}
            label="تصفية بالدور"
          />
          <Seg
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              { v: 'all', l: 'كل الحالات' },
              { v: 'active', l: 'نشط' },
              { v: 'off', l: 'موقوف' },
            ]}
            label="تصفية بالحالة"
          />

          {branchOptions.length > 0 && (
            <Select dir="rtl" value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-10 w-[150px] rounded-xl">
                <Store className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">كل الفروع</SelectItem>
                <SelectItem value="none">من غير فرع (مدير)</SelectItem>
                {branchOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ms-auto flex rounded-xl border bg-muted/50 p-0.5" role="group" aria-label="طريقة العرض">
            {([
              ['badges', LayoutGrid, 'عرض البطاقات'],
              ['list', List, 'عرض القائمة'],
            ] as const).map(([v, Icon, title]) => (
              <button
                key={v}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors',
                  view === v && 'bg-card text-foreground shadow-sm'
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        {!loading && users.length > 0 && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              عرض {num(filtered.length)} من {num(users.length)}
            </span>
            {hasFilter && (
              <button type="button" onClick={clearFilters} className="font-semibold text-violet-600 hover:underline dark:text-violet-400">
                مسح الفلاتر
              </button>
            )}
            <span
              className="ms-auto inline-flex cursor-help items-center gap-1"
              title={'النقطة على الصورة = آخر دخول:\n🟢 خلال 24 ساعة\n🟡 خلال 30 يوم\n🔴 أقدم من 30 يوم\n⚪ لسه ما دخلش'}
            >
              <Info className="size-3.5" />
              معنى النقط
            </span>
          </p>
        )}
      </div>
      )}

      {/* ═════════ المحتوى ═════════ */}
      {loading && users.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[250px] rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Users className="size-7" />
          </span>
          <div>
            <p className="font-bold">{users.length === 0 ? 'لسه مفيش مستخدمين' : 'مفيش نتايج بالفلاتر دي'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {users.length === 0
                ? 'أضف أول موظف وحدد فرعه وصلاحيته.'
                : 'جرّب كلمة بحث تانية أو امسح الفلاتر.'}
            </p>
          </div>
          {users.length === 0 ? (
            <Button onClick={openAdd}>
              <Plus className="size-4" />
              مستخدم جديد
            </Button>
          ) : (
            <Button variant="outline" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      ) : view === 'badges' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((u, i) => (
            <BadgeCard key={u.id} u={u} i={i} now={now} onEdit={openEdit} onToggle={toggleActive} />
          ))}
          {!hasFilter && (
            <button
              type="button"
              onClick={openAdd}
              className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-300/70 bg-violet-500/[0.03] p-6 text-violet-700 transition-colors hover:border-violet-500 hover:bg-violet-500/[0.07] dark:border-violet-400/30 dark:text-violet-300"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10 transition-transform group-hover:scale-105">
                <Plus className="size-6" />
              </span>
              <span className="text-sm font-bold">إضافة عضو للفريق</span>
              <span className="text-[11px] text-muted-foreground">بطاقة دخول جديدة بصلاحية وفرع</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_110px_minmax(0,1fr)_minmax(0,1fr)_130px] gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground lg:grid">
            <span>المستخدم</span>
            <span>الدور</span>
            <span>الفرع</span>
            <span>آخر دخول</span>
            <span className="text-end">الحالة</span>
          </div>
          <ul className="divide-y">
            {filtered.map((u) => (
              <ListRow key={u.id} u={u} now={now} onEdit={openEdit} onToggle={toggleActive} />
            ))}
          </ul>
        </div>
      )}

      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} />
    </div>
  )
}

/* ───────────────────────── مكوّنات صغيرة ───────────────────────── */

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', swatch)} />
      {label}
      <b className="tabular-nums text-foreground">{num(value)}</b>
    </span>
  )
}

const CHIP_TONES = {
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
} as const

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof CHIP_TONES
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5', CHIP_TONES[tone])}>
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}

function Seg({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
  label: string
}) {
  return (
    <div className="flex rounded-xl border bg-muted/50 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'h-8 rounded-[10px] px-3 text-xs font-semibold text-muted-foreground transition-colors',
            value === o.v && 'bg-card text-foreground shadow-sm'
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

/** مفتاح تشغيل/إيقاف — dir=ltr جوه عشان الـ thumb ما ينعكسش في RTL */
function AccessSwitch({
  on,
  onClick,
  label,
}: {
  on: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      dir="ltr"
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        on ? 'bg-emerald-500' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
          on && 'translate-x-5'
        )}
      />
    </button>
  )
}

function RolePill({ admin, onDark = false }: { admin: boolean; onDark?: boolean }) {
  const Icon = admin ? ShieldCheck : User
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        onDark
          ? 'bg-white/15 text-white backdrop-blur'
          : admin
            ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
            : 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
      )}
    >
      <Icon className="size-3" />
      {admin ? 'مدير' : 'موظف'}
    </span>
  )
}

function Avatar({
  u,
  size,
  presence,
  className,
}: {
  u: Pick<UserRow, 'name'>
  size: string
  presence?: Presence
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'ub-avatar flex items-center justify-center rounded-2xl font-extrabold text-white shadow-md',
          size
        )}
        style={{ background: gradOf(u.name || '?') }}
      >
        {u.name?.trim().charAt(0) || '?'}
      </span>
      {presence && (
        <span
          title={PRESENCE_LABEL[presence]}
          className={cn('absolute -bottom-1 -end-1 size-4 rounded-full ring-[3px] ring-card', PRESENCE_DOT[presence])}
        />
      )}
    </span>
  )
}

interface ItemProps {
  u: UserRow
  now: number
  onEdit: (u: UserRow) => void
  onToggle: (u: UserRow) => void
}

function lastLoginText(u: UserRow, now: number) {
  return u.lastLoginAt ? ago(u.lastLoginAt, now) : 'لسه ما دخلش'
}

/** بطاقة الدخول */
function BadgeCard({ u, i, now, onEdit, onToggle }: ItemProps & { i: number }) {
  const admin = isAdminRole(u.role)
  const presence = presenceOf(u, now)

  return (
    <article
      className={cn(
        'ub-card relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md',
        !u.active && 'ub-off'
      )}
      style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}
    >
      {/* رأس البطاقة: لون = مستوى الصلاحية */}
      <div
        className={cn(
          'relative h-[64px]',
          admin
            ? 'bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500'
            : 'bg-gradient-to-br from-slate-800 to-slate-600 dark:from-slate-600 dark:to-slate-500',
          !u.active && 'opacity-60 saturate-50'
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.35) 0 1px, transparent 1px 9px)',
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          }}
        />
        {/* فتحة الشريط */}
        <span
          aria-hidden
          className="absolute top-2.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/30 shadow-[inset_0_1px_2px_rgba(0,0,0,.35)]"
        />
      </div>

      <div className="px-4 pb-4">
        <div className="-mt-8 flex items-end gap-2.5">
          <Avatar u={u} size="size-[60px] text-2xl ring-4 ring-card" presence={presence} />
          <span className="mb-1">
            <RolePill admin={admin} />
          </span>
          {!u.active && (
            <span
              className="ms-auto mb-1 -rotate-6 rounded-md border-2 border-rose-500/70 px-2 py-0.5 text-xs font-extrabold text-rose-600 dark:text-rose-400"
              aria-label="الحساب موقوف"
            >
              موقوف
            </span>
          )}
        </div>

        <h3 className={cn('mt-2 truncate text-base font-extrabold leading-tight', !u.active && 'text-muted-foreground')}>
          {u.name}
        </h3>
        <p className="mt-0.5 truncate text-start text-xs text-muted-foreground" title={u.email}>
          <bdi dir="ltr">{u.email}</bdi>
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium">
            <Store className="size-3 text-muted-foreground" />
            {u.branch?.name ?? 'كل الفروع'}
          </span>
        </div>

        <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-dashed pt-2.5 text-[11px]">
          <div>
            <dt className="text-muted-foreground">آخر دخول</dt>
            <dd
              className="mt-0.5 font-semibold"
              title={u.lastLoginAt ? formatArabicDateTime(u.lastLoginAt) : undefined}
            >
              {lastLoginText(u, now)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">انضم في</dt>
            <dd className="mt-0.5 font-semibold" title={formatArabicDateTime(u.createdAt)}>
              {formatArabicDate(u.createdAt)}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
            <AccessSwitch on={u.active} onClick={() => onToggle(u)} label={u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'} />
            {u.active ? 'مسموح له بالدخول' : 'ممنوع من الدخول'}
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(u)} title="تعديل" aria-label={`تعديل ${u.name}`}>
            <Pencil className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

/** صف القائمة (للكثافة العالية) */
function ListRow({ u, now, onEdit, onToggle }: ItemProps) {
  const admin = isAdminRole(u.role)
  const presence = presenceOf(u, now)
  return (
    <li
      className={cn(
        'grid items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,2.2fr)_110px_minmax(0,1fr)_minmax(0,1fr)_130px]',
        !u.active && 'ub-off bg-muted/20'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar u={u} size="size-10 text-base !rounded-xl" presence={presence} />
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-bold', !u.active && 'text-muted-foreground')}>{u.name}</p>
          <p className="truncate text-start text-xs text-muted-foreground">
            <bdi dir="ltr">{u.email}</bdi>
          </p>
        </div>
      </div>
      <div>
        <RolePill admin={admin} />
      </div>
      <p className="truncate text-xs text-muted-foreground">{u.branch?.name ?? 'كل الفروع'}</p>
      <p className="text-xs text-muted-foreground" title={u.lastLoginAt ? formatArabicDateTime(u.lastLoginAt) : undefined}>
        {lastLoginText(u, now)}
      </p>
      <div className="flex items-center justify-between gap-2 lg:justify-end">
        <AccessSwitch on={u.active} onClick={() => onToggle(u)} label={u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'} />
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(u)} title="تعديل" aria-label={`تعديل ${u.name}`}>
          <Pencil className="size-4" />
        </Button>
      </div>
    </li>
  )
}

/* ───────────────────────── ديالوج الإضافة / التعديل ───────────────────────── */

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'لوحة المعلومات', pos: 'نقطة البيع', products: 'المنتجات',
  sales: 'سجل المبيعات', maintenance: 'الصيانة', customers: 'العملاء',
  suppliers: 'الموردين', purchases: 'المشتريات', inventory: 'المخزون',
  finance: 'المعاملات المالية', expenses: 'المصروفات', cash: 'الخزنة',
  reports: 'التقارير', settings: 'الإعدادات', users: 'المستخدمين',
  branches: 'الفروع',
}
const PERM_MODULES: string[] = ALL_MODULES.filter((m) => m !== 'guide')

// صف في سجل البطاقة: «الاسم ........ القيمة» بخط منقّط زي الفواتير
function LedgerRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="shrink-0 text-white/70">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-white/30" />
      <dd className={cn('truncate font-bold', warn && 'text-amber-300')}>{value}</dd>
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: UserRow | null
  onSaved: () => void
}

function UserDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPw, setShowPw] = React.useState(false)
  const [role, setRole] = React.useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE')
  const [saving, setSaving] = React.useState(false)
  const [branchId, setBranchId] = React.useState<string>('')
  const [branches, setBranches] = React.useState<{ id: number; name: string }[]>([])
  // 🔑 RBAC
  const [useCustomPerms, setUseCustomPerms] = React.useState(false)
  const [selectedPerms, setSelectedPerms] = React.useState<string[]>([])
  const [canViewProfits, setCanViewProfits] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setEmail(initial?.email ?? '')
      setPassword('')
      setShowPw(false)
      setRole(initial && isAdminRole(initial.role) ? 'ADMIN' : 'EMPLOYEE')
      setBranchId(initial?.branchId != null ? String(initial.branchId) : '')
      // RBAC init
      const parsedPerms = (() => {
        try { const v = JSON.parse(initial?.permissions ?? 'null'); return Array.isArray(v) ? v : null } catch { return null }
      })()
      setUseCustomPerms(!!parsedPerms && parsedPerms.length > 0)
      setSelectedPerms(parsedPerms ?? [])
      setCanViewProfits(Boolean(initial?.canViewProfits))
      fetch('/api/branches')
        .then((r) => (r.ok ? r.json() : []))
        .then(setBranches)
        .catch(() => setBranches([]))
    }
  }, [open, initial])

  const strength = strengthOf(password)
  const branchName = branches.find((b) => String(b.id) === branchId)?.name
  const unscoped = role === 'EMPLOYEE' && !branchId && branches.length > 0

  const submit = async () => {
    if (!name.trim()) return toast.error('الاسم مطلوب')
    if (!email.trim()) return toast.error('البريد الإلكتروني مطلوب')
    if (!initial && password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    if (initial && password && password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    setSaving(true)
    try {
      const body: any = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        branchId: branchId ? parseInt(branchId, 10) : null,
        permissions: role === 'ADMIN' ? null : (useCustomPerms ? selectedPerms : null),
        canViewProfits: role === 'ADMIN' ? true : canViewProfits,
      }
      if (initial) {
        if (password) body.password = password
        await api(`/api/users/${initial.id}`, { method: 'PUT', body })
        toast.success('تم تحديث المستخدم')
      } else {
        body.password = password
        await api('/api/users', { method: 'POST', body })
        toast.success('تمت إضافة المستخدم')
      }
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const roles = [
    { v: 'EMPLOYEE' as const, icon: User, title: 'موظف', desc: 'بيشتغل على بيانات فرعه بس' },
    { v: 'ADMIN' as const, icon: ShieldCheck, title: 'مدير', desc: 'صلاحيات كاملة على كل الفروع' },
  ]

  const isAdmin = role === 'ADMIN'
  // الصفحات مقفولة (بتتعرض كلها مفعّلة) لو مدير أو لو الموظف على «كل الصفحات»
  const locked = isAdmin || !useCustomPerms
  const has = (m: string) => locked || selectedPerms.includes(m)
  const grantedCount = PERM_MODULES.filter(has).length
  const profitsOn = isAdmin || canViewProfits
  const toggleMod = (m: string) =>
    setSelectedPerms((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const pagesText = locked
    ? 'كل الصفحات'
    : grantedCount === 0
      ? 'ولا صفحة'
      : `${grantedCount} من ${PERM_MODULES.length}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        mobileSheet
        className="gap-0 p-0 sm:max-w-[min(1020px,calc(100vw-2rem))] md:grid-cols-[288px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:rounded-3xl"
      >
        {/* ───────── شريط البطاقة (يمين): معاينة حيّة + سجل الصلاحيات ───────── */}
        <aside
          className={cn(
            'relative flex flex-col text-white transition-colors duration-300 max-md:rounded-t-[inherit] md:min-h-0',
            isAdmin
              ? 'bg-gradient-to-b from-violet-700 via-purple-700 to-fuchsia-600'
              : 'bg-gradient-to-b from-slate-800 via-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600'
          )}
        >
          {/* خطوط ناعمة تدّي ملمس البطاقة */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 11px)',
            }}
          />
          {/* فتحة الشريط */}
          <span
            aria-hidden
            className="absolute top-3 left-1/2 hidden h-1.5 w-14 -translate-x-1/2 rounded-full bg-black/35 shadow-[inset_0_1px_2px_rgba(0,0,0,.4)] md:block"
          />

          <div className="relative flex flex-1 flex-col gap-5 px-6 pt-6 pb-5 md:pt-10 md:pb-6">
            <DialogHeader className="text-start">
              <DialogTitle className="flex items-center gap-2 text-base text-white">
                <UserCog className="size-5" />
                {initial ? 'تعديل مستخدم' : 'مستخدم جديد'}
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-white/70">
                {initial ? 'غيّر البيانات أو الصلاحية — البطاقة بتتحدّث قدامك.' : 'اعمل بطاقة دخول جديدة للفريق.'}
              </DialogDescription>
            </DialogHeader>

            {/* هوية */}
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-4">
              <Avatar u={{ name: name || '?' }} size="size-14 text-2xl md:size-20 md:text-4xl" />
              <div className="min-w-0 md:w-full">
                <p className="truncate text-lg font-extrabold md:text-xl">{name.trim() || 'اسم المستخدم'}</p>
                <p className="truncate text-start text-xs text-white/70">
                  <bdi dir="ltr">{email.trim() || 'email@example.com'}</bdi>
                </p>
              </div>
            </div>

            {/* عدّاد الصفحات: كل شرطة = صفحة */}
            <div className="hidden md:block" aria-hidden>
              <div className="flex gap-[3px]">
                {PERM_MODULES.map((m) => (
                  <span
                    key={m}
                    className={cn(
                      'h-6 flex-1 rounded-[3px] transition-colors duration-200',
                      has(m) ? 'bg-white' : 'bg-white/20'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* سجل الصلاحيات */}
            <dl className="mt-auto hidden space-y-2.5 md:block">
              <LedgerRow label="الصلاحية" value={isAdmin ? 'مدير' : 'موظف'} />
              <LedgerRow label="الفرع" value={branchName ?? 'كل الفروع'} warn={unscoped} />
              <LedgerRow label="الصفحات" value={pagesText} warn={!locked && grantedCount === 0} />
              <LedgerRow label="الأرباح" value={profitsOn ? 'مسموح' : 'محجوبة'} />
            </dl>

            {/* نسخة الجوال المختصرة */}
            <div className="flex flex-wrap gap-1.5 md:hidden">
              <RolePill admin={isAdmin} onDark />
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  unscoped ? 'bg-amber-400 text-amber-950' : 'bg-white/15'
                )}
              >
                {unscoped ? <AlertTriangle className="size-3" /> : <Store className="size-3" />}
                {branchName ?? 'كل الفروع'}
              </span>
            </div>
          </div>
        </aside>

        {/* ───────── النموذج (يسار) ───────── */}
        <section className="flex min-h-0 min-w-0 flex-col">
          {/* الجسم: على الشاشات العادية كله ظاهر من غير تمرير، والتمرير احتياطي للشاشات القصيرة */}
          <div className="min-h-0 flex-1 space-y-5 p-5 md:overflow-y-auto md:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">
                  الاسم <span className="text-destructive">*</span>
                </Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">
                  البريد الإلكتروني <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* الصلاحية */}
            <div className="space-y-1.5">
              <Label>الصلاحية</Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الصلاحية">
                {roles.map((r) => {
                  const sel = role === r.v
                  return (
                    <button
                      key={r.v}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setRole(r.v)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/60',
                        sel ? 'border-violet-500 bg-violet-500/5 ring-1 ring-violet-500' : 'hover:bg-muted/50'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          sel ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <r.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{r.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{r.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* الفرع + كلمة المرور */}
            <div className="grid gap-4 sm:grid-cols-2">
              {branches.length > 0 && (
                <div className="space-y-1.5">
                  <Label>الفرع</Label>
                  <Select dir="rtl" value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="none">كل الفروع (مدير)</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p
                    className={cn(
                      'flex items-start gap-1.5 text-[11px] leading-snug',
                      unscoped ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                    )}
                    role={unscoped ? 'alert' : undefined}
                  >
                    {unscoped && <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
                    {unscoped
                      ? 'الموظف من غير فرع مش هيتقيّد بفرع معيّن. اختار فرعه لو عايزه يشوف بياناته بس.'
                      : isAdmin
                        ? 'المدير بيشوف كل الفروع.'
                        : 'الموظف هيشوف بيانات الفرع ده بس.'}
                  </p>
                </div>
              )}

              <div className={cn('space-y-1.5', branches.length === 0 && 'sm:col-span-2')}>
                <Label htmlFor="u-pass">
                  كلمة المرور{' '}
                  {initial ? (
                    <span className="text-xs font-normal text-muted-foreground">(سيبها فاضية لو مش هتغيّرها)</span>
                  ) : (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      id="u-pass"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      dir="ltr"
                      autoComplete="new-password"
                      placeholder="••••••"
                      className="pe-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPassword(genPassword())
                      setShowPw(true)
                    }}
                    title="توليد كلمة مرور قوية"
                  >
                    <Sparkles className="size-4" />
                    توليد
                  </Button>
                </div>
                {/* مكان ثابت لمؤشر القوة عشان الارتفاع ما يتحركش */}
                <div className={cn('flex h-4 items-center gap-2', !password && 'invisible')} aria-live="polite">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <span
                        key={n}
                        className={cn(
                          'h-1 flex-1 rounded-full bg-muted transition-colors',
                          strength.score >= n &&
                            (strength.score <= 1 ? 'bg-rose-500' : strength.score === 2 ? 'bg-amber-500' : 'bg-emerald-500')
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{strength.label}</span>
                </div>
              </div>
            </div>

            {/* 🔑 الصفحات المتاحة — دايمًا ظاهرة بنفس الحجم؛ بتتقفل لو مدير أو «كل الصفحات» */}
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">الصفحات المتاحة</span>
                  {isAdmin && (
                    <span className="text-[11px] text-muted-foreground">المدير بيدخل كل الصفحات</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!locked && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedPerms([...PERM_MODULES])}
                        className="rounded-md px-1.5 py-1 font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerms([])}
                        className="rounded-md px-1.5 py-1 font-semibold text-muted-foreground hover:bg-muted"
                      >
                        مسح
                      </button>
                    </div>
                  )}
                  <div
                    className={cn('flex rounded-xl border bg-muted/60 p-0.5', isAdmin && 'pointer-events-none opacity-50')}
                    role="radiogroup"
                    aria-label="طريقة تحديد الصفحات"
                  >
                    {[
                      { v: false, label: 'كل الصفحات' },
                      { v: true, label: 'تحديد يدوي' },
                    ].map((opt) => {
                      const sel = !isAdmin && useCustomPerms === opt.v
                      return (
                        <button
                          key={String(opt.v)}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          disabled={isAdmin}
                          onClick={() => {
                            setUseCustomPerms(opt.v)
                            if (!opt.v) setSelectedPerms([])
                          }}
                          className={cn(
                            'rounded-[10px] px-3 py-1 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/60',
                            sel ? 'bg-card text-violet-700 shadow-sm dark:text-violet-300' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div
                className={cn('mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4', locked && 'opacity-60')}
                role="group"
                aria-label="الصفحات"
              >
                {PERM_MODULES.map((mod) => {
                  const checked = has(mod)
                  return (
                    <button
                      key={mod}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={locked}
                      onClick={() => toggleMod(mod)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/60',
                        checked
                          ? 'border-emerald-500/60 bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300'
                          : 'bg-card text-muted-foreground hover:bg-muted/50',
                        locked && 'cursor-default'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                          checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40'
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <span className="truncate">{MODULE_LABELS[mod] ?? mod}</span>
                    </button>
                  )
                })}
              </div>

              {/* 🔒 رؤية الأرباح */}
              <div
                className={cn(
                  'mt-3 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5',
                  isAdmin && 'opacity-60'
                )}
              >
                <TrendingUp className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">رؤية الأرباح والتكاليف</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    أرقام الأرباح والتكاليف في الداشبورد والتقارير.
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    profitsOn ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}
                >
                  {profitsOn ? 'مسموح' : 'محجوبة'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profitsOn}
                  aria-label="رؤية الأرباح والتكاليف"
                  disabled={isAdmin}
                  onClick={() => setCanViewProfits((v) => !v)}
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-default',
                    profitsOn ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[inset-inline-start] duration-150',
                      profitsOn ? 'start-[calc(100%-1.125rem)]' : 'start-0.5'
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row justify-end gap-2 border-t bg-muted/30 px-5 py-3.5 md:px-7">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              className="bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white hover:from-violet-500 hover:to-fuchsia-400"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {initial ? 'حفظ التعديلات' : 'إضافة المستخدم'}
            </Button>
          </DialogFooter>
        </section>
      </DialogContent>
    </Dialog>
  )
}
