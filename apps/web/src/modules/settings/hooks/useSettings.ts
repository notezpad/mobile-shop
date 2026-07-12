/**
 * useSettings hook — cached settings with a key-based lookup.
 *
 * Usage:
 *   const { getSetting, isLoading } = useSettings('general');
 *   const appName = getSetting('general.app_name', 'Default');
 *
 *   // Single key lookup
 *   const { value: taxRate } = useSetting('finance.default_tax_rate', 14);
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { settingsApi } from '../api/settings.api';
import type { SettingCategory } from '@mobile-shop/shared';

/** Load all settings (optionally filtered by category). */
export function useSettings(category?: SettingCategory) {
  const query = useQuery({
    queryKey: ['settings', category ?? 'all'],
    queryFn: () => settingsApi.list({ category }),
    staleTime: 60 * 1000, // 1 min
  });

  const getSetting = useCallback(
    <T = unknown>(key: string, fallback?: T): T => {
      const setting = query.data?.find((s) => s.key === key);
      return (setting?.value as T) ?? (fallback as T);
    },
    [query.data],
  );

  return {
    settings: query.data ?? [],
    getSetting,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

/** Convenience hook for a single setting value. */
export function useSetting<T = unknown>(key: string, fallback?: T) {
  const { getSetting } = useSettings();
  return {
    value: getSetting<T>(key, fallback),
  };
}

/** Invalidate settings cache (after mutation). */
export function useInvalidateSettings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['settings'] });
}
