/**
 * PWA hooks — update prompt, offline detection, install prompt.
 */
import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useUiStore } from '@stores/ui.store';

/**
 * usePWAUpdate — detects when a new Service Worker version is available.
 */
export function usePWAUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        setInterval(() => {
          if (registration.installing || navigator.onLine === false) return;
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error: unknown) {
      console.error('SW registration failed:', error);
    },
  });

  const updateApp = () => {
    updateServiceWorker(true);
  };

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return { needRefresh, offlineReady, updateApp, close };
}

/**
 * useInstallPrompt — detects if the app can be installed (beforeinstallprompt).
 * Returns:
 *  - canInstall: boolean
 *  - promptInstall: () => Promise<void>
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return { canInstall: !!deferredPrompt, promptInstall };
}

/**
 * useOnlineStatus — tracks navigator.onLine + updates the UI store.
 */
export function useOnlineStatus() {
  const setOnline = useUiStore((s) => s.setOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return useUiStore((s) => s.isOnline);
}
