import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { APP_CONFIG } from '@core/config/constants';
import { applyLocale, applyTheme, useUiStore } from '@stores/ui.store';
import { PWAUpdatePrompt } from '@components/feedback/PWAUpdatePrompt';
import { OfflineIndicator } from '@components/feedback/OfflineIndicator';
import { useRealtimeSync } from '@modules/sync/hooks/useRealtimeSync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: APP_CONFIG.query.defaultStaleTime,
      gcTime: APP_CONFIG.query.defaultCacheTime,
      retry: APP_CONFIG.query.retry,
      refetchOnWindowFocus: APP_CONFIG.query.refetchOnWindowFocus,
    },
  },
});

/** Mounted INSIDE QueryClientProvider so useRealtimeSync (which uses React Query) has context access. */
function RealtimeSync() {
  useRealtimeSync();
  return null;
}

/** Provider: React Query + Toaster + theme/locale sync + PWA + Realtime. */
export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);

  // Apply theme + locale to <html> on every change.
  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  // Online/offline detection.
  useEffect(() => {
    const setOnline = useUiStore.getState().setOnline;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeSync />
      {children}
      <Toaster
        position={APP_CONFIG.toast.position}
        richColors={APP_CONFIG.toast.richColors}
        closeButton={APP_CONFIG.toast.closeButton}
        duration={APP_CONFIG.toast.duration}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      />
      {/* PWA: update prompt + offline indicator */}
      <PWAUpdatePrompt />
      <OfflineIndicator />
    </QueryClientProvider>
  );
}
