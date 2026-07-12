/**
 * useAuth hook — primary entry point for authentication state.
 *
 * Responsibilities:
 *  - Wrap the auth Zustand store with action methods.
 *  - Auto-load session from /auth/me on app mount (if accessToken present).
 *  - Sync accessToken to localStorage for the ApiClient.
 *
 * Usage:
 *   const { user, isAuthenticated, login, logout, loading } = useAuth();
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@stores/auth.store';
import { authApi } from '../api/auth.api';
import type { LoginInput } from '@mobile-shop/shared';
import { toast } from 'sonner';
import { AppError, ERROR_CODES } from '@mobile-shop/shared';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Bootstrap: if we have an accessToken in store, validate it via /auth/me.
  useEffect(() => {
    if (!isHydrated) return;
    if (!accessToken) {
      setInitializing(false);
      return;
    }

    // Persist token to localStorage for ApiClient to pick up.
    localStorage.setItem('mse-access-token', accessToken);

    let cancelled = false;
    (async () => {
      try {
        const session = await authApi.me();
        if (cancelled) return;
        setSession({ user: session.user, accessToken: session.accessToken || accessToken });
      } catch (err) {
        if (cancelled) return;
        // Token invalid/expired — clear session.
        if (err instanceof AppError && err.code === ERROR_CODES.AUTH_TOKEN_EXPIRED) {
          clearSession();
          localStorage.removeItem('mse-access-token');
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isHydrated, setSession, clearSession]);

  /** Login with username + password. */
  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true);
      try {
        const session = await authApi.login(input);
        localStorage.setItem('mse-access-token', session.accessToken);
        setSession({ user: session.user, accessToken: session.accessToken });
        toast.success(`أهلاً ${session.user.fullName} 👋`);
        return session;
      } catch (err) {
        const message =
          err instanceof AppError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'فشل تسجيل الدخول';
        toast.error(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  /** Logout — clear session + cookie. */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout — clear local state regardless.
    }
    localStorage.removeItem('mse-access-token');
    clearSession();
    toast.success('تم تسجيل الخروج');
  }, [clearSession]);

  return {
    user,
    accessToken,
    isAuthenticated,
    initializing,
    loading,
    login,
    logout,
  };
}
