'use client'

import * as React from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Loader2,
  Info,
  Shield,
  Wallet,
  Calendar,
  Crown,
  Package,
  Clock,
  AlertTriangle,
  TrendingUp,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from 'sonner'

/**
 * NotificationBell (v3 — WorkerOS style)
 *
 * 🛡️ 2026-09-15 (v3): Fix for the "500x duplicate + reappear after delete" bug.
 *   - `handleDelete` now actually calls `DELETE /api/notifications/[id]`
 *     instead of only removing from local state. The old behavior left the
 *     row in the DB, so the next 30s poll re-fetched it.
 *   - Added a "مسح الكل" (clear all) button in the panel footer that calls
 *     `DELETE /api/notifications/clear` to bulk-delete everything.
 *   - The backend dedup is now correctly keyed by `message` (was `title`,
 *     which was a constant string and never matched), so duplicates won't
 *     be created in the first place.
 */

interface Notification {
  id: number
  type: string
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
}

// ─── Type metadata (icons + colors per notification type) ───
const TYPE_META: Record<string, {
  icon: React.ElementType
  color: string
  bg: string
  label: string
}> = {
  // Our types
  low_stock: {
    icon: Package,
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    label: 'مخزون',
  },
  expiring_subscription: {
    icon: Clock,
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    label: 'اشتراك',
  },
  new_sale: {
    icon: ShoppingBag,
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    label: 'بيع',
  },
  warning: {
    icon: AlertTriangle,
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    label: 'تحذير',
  },
  info: {
    icon: Info,
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.12)',
    label: 'معلومة',
  },
  success: {
    icon: TrendingUp,
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    label: 'نجاح',
  },
  // WorkerOS types (for compatibility)
  system: {
    icon: Info,
    color: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.12)',
    label: 'النظام',
  },
  admin: {
    icon: Shield,
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    label: 'إدارة',
  },
  payroll: {
    icon: Wallet,
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    label: 'تصفية',
  },
  attendance: {
    icon: Calendar,
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.12)',
    label: 'حضور',
  },
  subscription: {
    icon: Crown,
    color: '#f472b6',
    bg: 'rgba(244, 114, 182, 0.12)',
    label: 'اشتراك',
  },
  worker: {
    icon: Package,
    color: '#22d3ee',
    bg: 'rgba(34, 211, 238, 0.12)',
    label: 'عمال',
  },
}

function fmtTimeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'الآن'
  const m = Math.floor(s / 60)
  if (m < 60) return `قبل ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} س`
  const day = Math.floor(h / 24)
  if (day < 30) return `قبل ${day} يوم`
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
}

export function NotificationBell() {
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<number | null>(null)
  const [clearingAll, setClearingAll] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  // ─── Fetch notifications on mount + every 30 seconds ───
  const load = React.useCallback(async () => {
    try {
      const data = await api<{ items: Notification[]; unreadCount: number; migrationNeeded?: boolean }>(
        '/api/notifications',
      )
      setNotifications(data.items ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch (e: any) {
      console.warn('[NotificationBell] fetch failed:', e?.message ?? e)
    }
  }, [])

  // PERF FIX (2026-09-25): polling every 30s meant 120 extra API calls/hour
  // per open tab, each one opening a DB connection — a major cause of the
  // slowness and the random 503s. Now: every 3 minutes, and only while the
  // tab is actually visible.
  React.useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void load()
    }
    tick()
    const id = setInterval(tick, 600000) // 🛡️ 10 دقائق بدل 3 (تقليل استهلاك الموارد)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // ─── Click-outside to close ───
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ─── Mark all as read ───
  const markAllRead = async () => {
    try {
      await api('/api/notifications/read', { method: 'PATCH', body: { all: true } })
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      toast.success('تم تحديد كل الإشعارات كمقروءة')
    } catch {
      /* ignore */
    }
  }

  // ─── Mark single as read + navigate ───
  const handleClick = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        await api('/api/notifications/read', { method: 'PATCH', body: { id: notif.id } })
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        /* ignore */
      }
    }
    if (notif.link) {
      window.location.href = notif.link
    }
    setOpen(false)
  }

  // ─── Delete single notification (REAL delete, not just local) ───
  const handleDelete = async (e: React.MouseEvent, notif: Notification) => {
    e.stopPropagation()
    if (busyId !== null) return // prevent double-clicks
    setBusyId(notif.id)
    try {
      // 🛡️ 2026-09-15 (v3): actually call DELETE /api/notifications/[id]
      // — the old version only updated local state, so the row stayed in
      // the DB and reappeared on the next 30s poll.
      await api(`/api/notifications/${notif.id}`, { method: 'DELETE' })
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
      if (!notif.isRead) setUnreadCount((c) => Math.max(0, c - 1))
      toast.success('تم حذف الإشعار')
    } catch (err: any) {
      toast.error('فشل حذف الإشعار')
      console.error('[NotificationBell] delete failed:', err?.message ?? err)
    } finally {
      setBusyId(null)
    }
  }

  // ─── Clear ALL notifications (bulk delete) ───
  const handleClearAll = async () => {
    if (clearingAll) return
    if (notifications.length === 0) return
    if (!confirm('هل أنت متأكد من مسح كل الإشعارات؟ لا يمكن التراجع.')) return
    setClearingAll(true)
    try {
      await api('/api/notifications/clear', { method: 'DELETE' })
      setNotifications([])
      setUnreadCount(0)
      toast.success('تم مسح كل الإشعارات')
    } catch (err: any) {
      toast.error('فشل مسح الإشعارات')
      console.error('[NotificationBell] clear all failed:', err?.message ?? err)
    } finally {
      setClearingAll(false)
    }
  }

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      {/* ─── Bell button ─── */}
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-expanded={open}
        title="الإشعارات"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {unreadCount === 0 && (
          <span className="notif-bell-dot" />
        )}
      </button>

      {/* ─── Dropdown panel ─── */}
      {open && (
        <div className="notif-panel">
          {/* Header */}
          <div className="notif-panel-head">
            <div className="notif-panel-head-title">
              <Bell className="size-4" />
              <span>الإشعارات</span>
              {unreadCount > 0 && (
                <span className="notif-panel-count">{unreadCount} جديد</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button className="notif-panel-markall" onClick={markAllRead}>
                  <CheckCheck className="size-3.5" />
                  <span className="notif-lbl-full">تحديد الكل كمقروء</span>
                  <span className="notif-lbl-short">الكل كمقروء</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="notif-panel-markall"
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  title="مسح كل الإشعارات"
                >
                  {clearingAll ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  <span className="notif-lbl-full">مسح الكل</span>
                  <span className="notif-lbl-short">مسح</span>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="notif-panel-body">
            {loading && (
              <div className="notif-empty">
                <Loader2 className="size-8 animate-spin" />
                <span>جاري التحميل...</span>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="notif-empty">
                <BellOff className="size-8" />
                <span>لا توجد إشعارات</span>
                <small>ستظهر هنا الإشعارات الجديدة فور وصولها</small>
              </div>
            )}

            {!loading &&
              notifications.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.info
                const Icon = meta.icon
                const isBusy = busyId === n.id
                return (
                  <div
                    key={n.id}
                    className={cn('notif-item', n.isRead ? 'read' : 'unread')}
                    onClick={() => handleClick(n)}
                    style={{ '--n-color': meta.color, '--n-bg': meta.bg } as React.CSSProperties}
                  >
                    {/* Icon */}
                    <div
                      className="notif-item-icon"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <Icon className="size-4" />
                    </div>

                    {/* Body */}
                    <div className="notif-item-body">
                      <div className="notif-item-head">
                        <span className="notif-item-title">{n.title}</span>
                        {!n.isRead && <span className="notif-item-dot" />}
                      </div>
                      <p className="notif-item-text">{n.message}</p>
                      <div className="notif-item-foot">
                        <span
                          className="notif-item-type"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className="notif-item-time">{fmtTimeAgo(n.createdAt)}</span>
                      </div>
                    </div>

                    {/* Delete button (hover) */}
                    <button
                      className="notif-item-delete"
                      onClick={(e) => handleDelete(e, n)}
                      disabled={isBusy}
                      title="حذف"
                      aria-label="حذف الإشعار"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <X className="size-3" />
                      )}
                    </button>
                  </div>
                )
              })}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="notif-panel-foot">
              <span className="notif-panel-foot-text">
                <Info className="size-3" />
                الإشعارات تُحدّث تلقائياً كل 30 ثانية
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
