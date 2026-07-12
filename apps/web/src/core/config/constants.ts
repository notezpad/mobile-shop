/**
 * Application-wide constants for the web client.
 * Backend constants live in @mobile-shop/shared.
 */
export const APP_CONFIG = {
  /** Query client defaults. */
  query: {
    defaultStaleTime: 30_000,
    defaultCacheTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  },

  /** Local storage keys. */
  storageKeys: {
    auth: 'mse-auth',
    theme: 'mse-theme',
    locale: 'mse-locale',
    sidebarCollapsed: 'mse-sidebar-collapsed',
    lastBranchId: 'mse-last-branch',
  },

  /** Toast defaults. */
  toast: {
    duration: 4000,
    position: 'top-center' as const,
    richColors: true,
    closeButton: true,
  },

  /** Pagination. */
  pagination: {
    pageSizeOptions: [10, 20, 50, 100],
    defaultPageSize: 20,
  },

  /** Date formats (used with date-fns or Intl.DateTimeFormat). */
  dateFormat: {
    short: 'yyyy-MM-dd',
    long: 'yyyy-MM-dd HH:mm',
    time: 'HH:mm',
  },
} as const;
