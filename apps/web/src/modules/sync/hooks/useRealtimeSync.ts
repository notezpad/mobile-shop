/**
 * Realtime sync hooks — subscribe to Supabase Realtime for live updates.
 *
 * When another device in the same tenant makes a change, this hook
 * invalidates the relevant React Query cache to trigger a refetch.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@core/db/supabase';
import { useAuthStore } from '@stores/auth.store';
import { startAutoSync, stopAutoSync, runSync } from '../api/sync.api';
import { useSyncStore } from '@stores/sync.store';

/** Tables to watch for realtime changes. */
const REALTIME_TABLES = [
  'sales', 'sale_items',
  'repairs', 'repair_status_history',
  'customers',
  'inventory_stocks', 'stock_movements',
  'cashboxes', 'cashbox_transactions',
  'expenses', 'revenues',
  'products', 'device_units',
  'returns',
  'notifications',
];

/** Query keys to invalidate when a table changes. */
const TABLE_TO_QUERY_KEYS: Record<string, string[]> = {
  sales: ['sales', 'sale', 'report'],
  sale_items: ['sales', 'sale'],
  repairs: ['repairs', 'repair', 'report'],
  repair_status_history: ['repairs', 'repair'],
  customers: ['customers', 'customer'],
  inventory_stocks: ['inventory', 'report'],
  stock_movements: ['inventory', 'movements'],
  cashboxes: ['cashbox'],
  cashbox_transactions: ['cashbox'],
  expenses: ['expenses'],
  revenues: ['revenues'],
  products: ['products', 'product', 'report'],
  device_units: ['devices'],
  returns: ['returns', 'return'],
  notifications: ['notifications'],
};

/**
 * useRealtimeSync — subscribes to Supabase Realtime + starts auto-sync.
 * Call this once at the app root (inside AppProviders or DashboardLayout).
 */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setSyncing = useSyncStore((s) => s.setSyncing);
  const setLastSyncAt = useSyncStore((s) => s.setLastSyncAt);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const supabase = getSupabase();

    // Start auto-sync.
    startAutoSync();

    // Subscribe to realtime changes.
    const channel = supabase
      .channel('mse-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          const table = payload.table;
          const queryKeys = TABLE_TO_QUERY_KEYS[table];

          if (queryKeys) {
            // Invalidate all related queries.
            queryKeys.forEach((key) => {
              queryClient.invalidateQueries({ queryKey: [key] });
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncing(false);
          setLastSyncAt(new Date().toISOString());
        }
      });

    // Sync on window focus (user returns to tab).
    const handleFocus = () => {
      if (navigator.onLine) {
        void runSync().catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);

    // Sync on online event.
    const handleOnline = () => {
      void runSync().catch(() => {});
    };
    window.addEventListener('online', handleOnline);

    // Listen for SYNC_TRIGGER from Service Worker (Background Sync).
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_TRIGGER') {
        void runSync().catch(() => {});
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      stopAutoSync();
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [isAuthenticated, user, queryClient, setSyncing, setLastSyncAt]);
}
