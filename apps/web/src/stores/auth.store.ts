import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SessionPayload, UserPreferences } from '@mobile-shop/shared';
import { APP_CONFIG } from '@core/config/constants';

interface AuthState {
  user: {
    id: string;
    username: string;
    fullName: string;
    roleId: string;
    roleKey: string;
    branchId: string | null;
    permissions: string[];
    preferences: UserPreferences;
  } | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;

  setSession: (session: {
    user: AuthState['user'];
    accessToken: string;
  }) => void;
  clearSession: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isHydrated: false,

      setSession: (session) =>
        set({
          user: session.user,
          accessToken: session.accessToken,
          isAuthenticated: true,
        }),

      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        }),

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: APP_CONFIG.storageKeys.auth,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Helper: check a permission key. */
export function hasPermission(permission: string): boolean {
  const state = useAuthStore.getState();
  if (!state.user) return false;
  if (state.user.roleKey === 'super_admin') return true;
  return state.user.permissions.includes(permission);
}

/** Helper: get current user's primary branch. */
export function getCurrentBranchId(): string | null {
  return useAuthStore.getState().user?.branchId ?? null;
}

/** Type re-export for convenience. */
export type { SessionPayload };
