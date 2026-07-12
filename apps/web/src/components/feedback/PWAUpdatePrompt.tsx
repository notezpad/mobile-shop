/**
 * PWAUpdatePrompt — shows a toast/banner when a new SW version is available
 * or when the app is ready for offline use.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Download, WifiOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@components/ui';
import { usePWAUpdate } from '@core/hooks/usePWA';

export function PWAUpdatePrompt() {
  const { needRefresh, offlineReady, updateApp, close } = usePWAUpdate();

  // Show offline-ready toast once.
  useEffect(() => {
    if (offlineReady) {
      toast.success('التطبيق جاهز للعمل بدون إنترنت', {
        description: 'يمكنك الآن استخدام النظام في وضع عدم الاتصال',
        duration: 5000,
        icon: <CheckCircle2 className="size-4" />,
      });
      close();
    }
  }, [offlineReady, close]);

  // Show update-available toast with action.
  useEffect(() => {
    if (needRefresh) {
      toast.info('تحديث جديد متاح', {
        description: 'نسخة جديدة من التطبيق جاهزة للتثبيت',
        duration: Infinity, // persistent until user acts
        icon: <RefreshCw className="size-4" />,
        action: {
          label: 'تحديث الآن',
          onClick: () => {
            updateApp();
          },
        },
        cancel: {
          label: 'لاحقاً',
          onClick: () => close(),
        },
      });
    }
  }, [needRefresh, updateApp, close]);

  return null;
}
