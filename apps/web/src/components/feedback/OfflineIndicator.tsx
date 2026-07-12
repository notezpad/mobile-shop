/**
 * OfflineIndicator — shows a banner when the app goes offline.
 * Disappears automatically when back online.
 */
import { useEffect } from 'react';
import { useUiStore } from '@stores/ui.store';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const isOnline = useUiStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-0 right-0 left-0 z-50 bg-warning text-warning-foreground px-4 py-2 text-center text-sm shadow-elevated md:right-[var(--sidebar-width)]">
      <span className="flex items-center justify-center gap-2">
        <WifiOff className="size-4 animate-pulse" />
        <span>وضع عدم الاتصال — التغييرات ستُحفظ محلياً وتُزامن عند عودة الاتصال</span>
      </span>
    </div>
  );
}
