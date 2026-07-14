import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { APP_CONFIG } from '@core/config/constants';

type Theme = 'light' | 'dark' | 'system';
type Locale = 'ar' | 'en';

interface UiState {
  theme: Theme;
  locale: Locale;
  sidebarCollapsed: boolean;
  isOnline: boolean;

  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setOnline: (online: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      locale: 'ar',
      sidebarCollapsed: false,
      isOnline: true,

      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'mse-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

/** Apply theme class to <html>. Called by ThemeProvider. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

/** Apply locale + direction to <html>. */
export function applyLocale(locale: Locale): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

void APP_CONFIG; // referenced for tree-shaking safety
