/**
 * NotificationsDropdown — bell icon with unread badge + dropdown panel.
 * Shown in the dashboard header.
 */
import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, AlertTriangle, Wrench, Wallet, Info, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@core/utils/cn';
import { Button } from '@components/ui';
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '../../audit/api/audit.api';
import type { Notification } from '@mobile-shop/shared';
import { formatRelative } from '@core/utils/date';

const TYPE_ICONS: Record<string, typeof Bell> = {
  low_stock: AlertTriangle,
  repair_ready: Wrench,
  repair_overdue: Clock,
  expense_due: Wallet,
  cashbox_open: Wallet,
  cashbox_not_closed: AlertTriangle,
  system: Info,
};

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: unreadData } = useUnreadCount();
  const { data: notifResult } = useNotifications(false);
  const markReadMut = useMarkRead();
  const markAllReadMut = useMarkAllRead();

  const unreadCount = unreadData?.count ?? 0;
  const notifications = notifResult?.items ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markReadMut.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="الإشعارات"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border bg-popover shadow-elevated">
          {/* Header */}
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold">الإشعارات ({unreadCount} غير مقروء)</h3>
            {unreadCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => markAllReadMut.mutate()}>
                <CheckCheck className="size-3.5" />
                <span className="text-xs">تعليم الكل كمقروء</span>
              </Button>
            ) : null}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا إشعارات</p>
            ) : (
              <div className="divide-y">
                {notifications.slice(0, 10).map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? Info;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        'flex w-full items-start gap-2 px-3 py-2.5 text-right transition-colors hover:bg-muted/50',
                        !n.is_read && 'bg-primary/5',
                      )}
                    >
                      <div className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', !n.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs', !n.is_read && 'font-bold')}>{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(n.created_at)}</p>
                      </div>
                      {!n.is_read ? <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

void Check;
